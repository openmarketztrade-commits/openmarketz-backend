ALTER TABLE "Shipment" ADD COLUMN "sellerId" TEXT, ADD COLUMN "providerOrderId" TEXT, ADD COLUMN "serviceCode" TEXT, ADD COLUMN "waybillDocument" TEXT;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Shipment_sellerId_status_idx" ON "Shipment"("sellerId", "status");
CREATE UNIQUE INDEX "Shipment_providerOrderId_key" ON "Shipment"("providerOrderId");
ALTER TABLE "Address" ADD COLUMN "shipbubbleAddressCode" TEXT;
ALTER TABLE "SellerApplication" ADD COLUMN "shipbubbleAddressCode" TEXT;
