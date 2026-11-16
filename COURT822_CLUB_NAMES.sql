-- Owner-only lookup of tournament-specific club names saved in registration drafts.
-- No changes to checkout/payment/QR tables or existing registration RPCs.
CREATE OR REPLACE FUNCTION public.court822_owner_roster_clubs(p_tournament_id uuid)
RETURNS TABLE(team_id uuid, player_email text, club_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.court822_is_owner() THEN
    RAISE EXCEPTION 'Owner access required';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (tm.id, lower(btrim(pl.value->>'email')))
    tm.id,
    lower(btrim(pl.value->>'email')),
    COALESCE(NULLIF(left(btrim(pl.value->>'club_name'),100),''),'Independent')
  FROM public.tournament_checkouts co
  JOIN public.tournament_teams tm ON tm.checkout_id = co.id
  JOIN public.tournament_checkout_requests r
    ON r.checkout_id = co.id
   AND r.tournament_id = co.tournament_id
   AND r.captain_user_id = co.created_by
   AND r.request_id = co.request_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.draft_data->'players')='array'
      THEN r.draft_data->'players' ELSE '[]'::jsonb END
  ) AS pl(value)
  WHERE co.tournament_id = p_tournament_id
    AND co.status = 'confirmed'
    AND co.owner_review_status = 'approved'
    AND co.payment_verified_at IS NOT NULL
    AND tm.status = 'confirmed'
    AND lower(btrim(pl.value->>'email')) IN (
      SELECT lower(btrim(p.email))
      FROM public.tournament_team_players tp
      JOIN public.tournament_players p ON p.id = tp.player_id
      WHERE tp.team_id = tm.id
      UNION
      SELECT lower(btrim(pp.partner_email))
      FROM public.court822_checkout_pending_partners pp
      WHERE pp.team_id = tm.id AND pp.checkout_id = co.id
        AND pp.captain_authorized = true
    )
  ORDER BY tm.id, lower(btrim(pl.value->>'email'));
END;
$function$;
REVOKE ALL ON FUNCTION public.court822_owner_roster_clubs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.court822_owner_roster_clubs(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
