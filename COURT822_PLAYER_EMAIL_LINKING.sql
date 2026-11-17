-- COURT822 V4: safe email-to-partner association, independent of identity verification.
-- This does NOT update tournament_players.user_id or identity_status.
BEGIN;
CREATE TABLE IF NOT EXISTS public.court822_partner_account_links (
  pending_partner_id uuid PRIMARY KEY REFERENCES public.court822_checkout_pending_partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_email text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS court822_partner_account_links_user_idx
  ON public.court822_partner_account_links(user_id);
ALTER TABLE public.court822_partner_account_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.court822_partner_account_links FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.court822_link_my_partner_email_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_count integer := 0;
  v_conflicts integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT lower(btrim(email)) INTO v_email FROM auth.users
  WHERE id=v_user AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Verified email required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 822));
  SELECT count(*) INTO v_conflicts
  FROM public.court822_checkout_pending_partners pp
  JOIN public.court822_partner_account_links l ON l.pending_partner_id=pp.id
  WHERE lower(btrim(pp.partner_email))=v_email AND l.user_id<>v_user;
  IF v_conflicts>0 THEN RAISE EXCEPTION 'Existing account association requires owner review'; END IF;
  -- Match only captain-authorized, paid-and-confirmed registrations.
  INSERT INTO public.court822_partner_account_links(pending_partner_id,user_id,registered_email)
  SELECT pp.id,v_user,v_email
  FROM public.court822_checkout_pending_partners pp
  JOIN public.tournament_checkouts co ON co.id=pp.checkout_id
  JOIN public.tournament_teams tm ON tm.id=pp.team_id AND tm.checkout_id=co.id
  WHERE lower(btrim(pp.partner_email))=v_email
    AND pp.captain_authorized=true
    AND pp.status IN ('pending','confirmed')
    AND co.status='confirmed' AND co.payment_verified_at IS NOT NULL
    AND co.owner_review_status='approved' AND tm.status='confirmed'
    AND co.total_amount>0
    AND (SELECT coalesce(sum(pay.amount),0) FROM public.tournament_checkout_payments pay
         WHERE pay.checkout_id=co.id AND pay.status='verified')>=co.total_amount
  ON CONFLICT (pending_partner_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('success',true,'email_linked',true,
    'new_registrations_linked',v_count,
    'identity_verified',false,
    'message','Email account associated. In-person identity verification remains separate.');
END;
$fn$;
REVOKE ALL ON FUNCTION public.court822_link_my_partner_email_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court822_link_my_partner_email_v1() TO authenticated;
-- Keep the older unsafe RPC disabled.
REVOKE ALL ON FUNCTION public.court822_link_my_partner_account() FROM PUBLIC,anon,authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
