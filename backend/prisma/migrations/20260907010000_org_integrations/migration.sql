-- CreateTable
CREATE TABLE "OrgIntegration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "razorpayKeyIdEnc" TEXT,
    "razorpayKeySecretEnc" TEXT,
    "razorpayWebhookSecretEnc" TEXT,
    "livePayments" BOOLEAN NOT NULL DEFAULT false,
    "emailLive" BOOLEAN NOT NULL DEFAULT false,
    "emailFromName" TEXT,
    "emailReplyTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgIntegration_orgId_key" ON "OrgIntegration"("orgId");

-- AddForeignKey
ALTER TABLE "OrgIntegration" ADD CONSTRAINT "OrgIntegration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

