-- US-903: audit entries cannot be edited or deleted through ANY interface —
-- enforced in the database itself, not just by the absence of app endpoints.
-- A trigger (rather than REVOKE) binds every role, including the table owner.
CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
