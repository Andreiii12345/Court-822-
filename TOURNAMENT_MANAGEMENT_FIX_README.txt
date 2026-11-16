COURT822 owner tournament management frontend fix

Includes published tournaments in management selector; Delete Unused Tournament available for draft/published; Archive only for completed; confirmation requires exact tournament name; error messages persist after failure.

Prerequisite: previously installed court822_owner_delete_empty_tournament_v1 backend supporting draft/published unused tournaments. This package does not change Supabase SQL, payment, QR, or registration functions.

Deploy all site files to GitHub, refresh owner.html, then test with an unwanted unused tournament. A protected tournament must fail deletion.
