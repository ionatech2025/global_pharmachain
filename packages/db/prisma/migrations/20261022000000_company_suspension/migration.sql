-- Platform-admin company lifecycle: reversible suspension and archival deletion.
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'DELETED';
