CREATE FUNCTION cleanup_auth_verifications_for_deleted_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM "verification"
	WHERE lower(substring("value" from '"email":"([^"]+)"')) = lower(OLD."email");
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER cleanup_auth_verifications_after_user_delete
AFTER DELETE ON "user"
FOR EACH ROW
EXECUTE FUNCTION cleanup_auth_verifications_for_deleted_user();
