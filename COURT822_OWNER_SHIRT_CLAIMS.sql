-- COURT822 owner-only QR preview and individual shirt claims.
-- Run in Supabase SQL Editor. Does not change existing payments, QRs, or email records.
BEGIN;

CREATE OR REPLACE FUNCTION public.court822_owner_preview_team_qr(p_qr_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_hash text; v_qr record; v_checkout record; v_team record; v_players jsonb; v_freebies jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.court822_is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF p_qr_token IS NULL OR p_qr_token !~ '^[0-9a-fA-F]{64}$' THEN RAISE EXCEPTION 'Invalid QR credential'; END IF;
 v_hash := encode(extensions.digest(convert_to(lower(p_qr_token),'UTF8'),'sha256'),'hex');
 SELECT * INTO v_qr FROM public.court822_team_qr_tokens WHERE token_hash=v_hash;
 IF NOT FOUND OR v_qr.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'QR unavailable or revoked'; END IF;
 SELECT * INTO v_checkout FROM public.tournament_checkouts WHERE id=v_qr.checkout_id;
 IF NOT FOUND OR v_checkout.status <> 'confirmed' OR v_checkout.payment_verified_at IS NULL
   OR v_checkout.owner_review_status <> 'approved' OR v_checkout.total_amount <= 0
   OR (SELECT COALESCE(sum(amount),0) FROM public.tournament_checkout_payments WHERE checkout_id=v_checkout.id AND status='verified') < v_checkout.total_amount
 THEN RAISE EXCEPTION 'Checkout not eligible for check-in'; END IF;
 SELECT * INTO v_team FROM public.tournament_teams WHERE id=v_qr.team_id AND checkout_id=v_checkout.id AND status='confirmed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Team not confirmed'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.position),'[]'::jsonb) INTO v_players FROM (
  SELECT tp.player_position AS position, p.id AS player_id, p.full_name AS name, p.email,
    p.identity_status, NULL::uuid AS pending_partner_id
  FROM public.tournament_team_players tp JOIN public.tournament_players p ON p.id=tp.player_id
  WHERE tp.team_id=v_team.id
  UNION ALL
  SELECT pp.player_position, pp.player_id, COALESCE(p.full_name,pp.partner_name), pp.partner_email,
    COALESCE(p.identity_status,'unlinked'), pp.id
  FROM public.court822_checkout_pending_partners pp LEFT JOIN public.tournament_players p ON p.id=pp.player_id
  WHERE pp.team_id=v_team.id AND pp.checkout_id=v_checkout.id AND pp.captain_authorized=true
 ) s;
 IF jsonb_array_length(v_players) <> 2 THEN RAISE EXCEPTION 'Exactly two authorized players required'; END IF;
 -- Reuse existing owner-only freebie eligibility function; filter to this team's linked player IDs.
 SELECT COALESCE(jsonb_agg(x.value),'[]'::jsonb) INTO v_freebies
 FROM jsonb_array_elements(public.court822_owner_get_confirmed_player_freebies(v_checkout.tournament_id)) x(value)
 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(v_players) p(value)
               WHERE p.value->>'player_id'=x.value->>'player_id');
 RETURN jsonb_build_object('success',true,'team_id',v_team.id,'checkout_id',v_checkout.id,
  'tournament_id',v_checkout.tournament_id,'checked_in',v_qr.checked_in_at IS NOT NULL,
  'checked_in_at',v_qr.checked_in_at,'players',v_players,'freebies',v_freebies);
END; $$;

CREATE OR REPLACE FUNCTION public.court822_owner_verify_partner_at_checkin(
 p_qr_token text, p_pending_partner_id uuid, p_identity_checked boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_preview jsonb; v_partner record; v_player_id uuid; v_existing record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.court822_is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF p_identity_checked IS DISTINCT FROM true THEN RAISE EXCEPTION 'Owner must verify original player identity in person'; END IF;
 v_preview:=public.court822_owner_preview_team_qr(p_qr_token);
 SELECT * INTO v_partner FROM public.court822_checkout_pending_partners
 WHERE id=p_pending_partner_id AND team_id=(v_preview->>'team_id')::uuid
 AND checkout_id=(v_preview->>'checkout_id')::uuid AND captain_authorized=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Partner does not belong to this team'; END IF;
 IF v_partner.player_id IS NOT NULL THEN
   SELECT * INTO v_existing FROM public.tournament_players WHERE id=v_partner.player_id FOR UPDATE;
   IF NOT FOUND OR lower(trim(v_existing.email)) IS DISTINCT FROM lower(trim(v_partner.partner_email))
     THEN RAISE EXCEPTION 'Linked identity mismatch'; END IF;
   IF v_existing.identity_status <> 'verified' THEN
     UPDATE public.tournament_players SET identity_status='verified' WHERE id=v_existing.id;
   END IF;
   RETURN jsonb_build_object('success',true,'player_id',v_existing.id,'already_linked',true);
 END IF;
 IF nullif(trim(v_partner.partner_name),'') IS NULL OR v_partner.partner_gender NOT IN ('male','female')
 OR v_partner.partner_email IS NULL OR v_partner.partner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 THEN RAISE EXCEPTION 'Partner details require manual correction before verification'; END IF;
 -- Never silently duplicate or take over an existing player identity.
 IF EXISTS (SELECT 1 FROM public.tournament_players WHERE lower(trim(email))=lower(trim(v_partner.partner_email)))
 THEN RAISE EXCEPTION 'Existing email identity found; resolve manually'; END IF;
 INSERT INTO public.tournament_players(user_id,full_name,email,gender,identity_status)
 VALUES(NULL,trim(v_partner.partner_name),lower(trim(v_partner.partner_email)),v_partner.partner_gender,'verified')
 RETURNING id INTO v_player_id;
 UPDATE public.court822_checkout_pending_partners SET player_id=v_player_id WHERE id=v_partner.id;
 RETURN jsonb_build_object('success',true,'player_id',v_player_id,'already_linked',false);
END; $$;

CREATE OR REPLACE FUNCTION public.court822_owner_claim_team_freebie(
 p_qr_token text, p_player_id uuid, p_freebie_id uuid, p_identity_checked boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_preview jsonb; v_tournament uuid; v_item jsonb; v_allocation integer; v_claimed integer; v_size text; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.court822_is_owner() THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF p_identity_checked IS DISTINCT FROM true THEN RAISE EXCEPTION 'Identity verification required'; END IF;
 v_preview:=public.court822_owner_preview_team_qr(p_qr_token);
 IF COALESCE((v_preview->>'checked_in')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Check in team before claiming shirts'; END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_preview->'players') p(value)
  WHERE p.value->>'player_id'=p_player_id::text AND p.value->>'identity_status'='verified')
 THEN RAISE EXCEPTION 'Verified player does not belong to this team'; END IF;
 v_tournament:=(v_preview->>'tournament_id')::uuid;
 -- Lock freebie row to serialize claims across different teams/checkouts for the same player.
 PERFORM 1 FROM public.tournament_freebies WHERE id=p_freebie_id AND tournament_id=v_tournament AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Freebie unavailable'; END IF;
 SELECT x.value INTO v_item FROM jsonb_array_elements(public.court822_owner_get_confirmed_player_freebies(v_tournament)) x(value)
 WHERE x.value->>'player_id'=p_player_id::text AND x.value->>'freebie_id'=p_freebie_id::text;
 IF NOT FOUND OR v_item->>'claim_ready' <> 'true' OR v_item->>'size_review_required'='true'
 THEN RAISE EXCEPTION 'Player freebie not claim-ready'; END IF;
 v_allocation:=(v_item->>'allocated_quantity')::integer;
 v_size:=v_item->>'selected_size';
 SELECT COALESCE(sum(claimed_quantity),0) INTO v_claimed FROM public.tournament_freebie_claims
 WHERE tournament_id=v_tournament AND player_id=p_player_id AND freebie_id=p_freebie_id;
 IF v_allocation < 1 OR v_claimed >= v_allocation THEN RAISE EXCEPTION 'Freebie already fully claimed'; END IF;
 INSERT INTO public.tournament_freebie_claims(tournament_id,player_id,freebie_id,selected_size,claimed_quantity,claimed_at,claimed_by)
 VALUES(v_tournament,p_player_id,p_freebie_id,v_size,1,now(),auth.uid())
 ON CONFLICT (tournament_id,player_id,freebie_id) DO UPDATE
 SET claimed_quantity=public.tournament_freebie_claims.claimed_quantity+1,
 claimed_at=now(),claimed_by=auth.uid()
 WHERE public.tournament_freebie_claims.claimed_quantity < v_allocation;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count <> 1 THEN RAISE EXCEPTION 'Claim quantity exceeded'; END IF;
 RETURN jsonb_build_object('success',true,'player_id',p_player_id,'freebie_id',p_freebie_id,'claimed_quantity',v_claimed+1);
END; $$;

REVOKE ALL ON FUNCTION public.court822_owner_preview_team_qr(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.court822_owner_verify_partner_at_checkin(text,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.court822_owner_claim_team_freebie(text,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court822_owner_preview_team_qr(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.court822_owner_verify_partner_at_checkin(text,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.court822_owner_claim_team_freebie(text,uuid,uuid,boolean) TO authenticated;
COMMIT;
