-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING';
