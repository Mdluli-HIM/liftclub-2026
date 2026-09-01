-- AlterTable
ALTER TABLE "User" ADD COLUMN     "idDocumentUrl" TEXT,
ADD COLUMN     "licenseDocumentUrl" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "registrationDocumentUrl" TEXT;
