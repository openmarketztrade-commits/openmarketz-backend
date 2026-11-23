CREATE TABLE "StoreFollow" (
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreFollow_pkey" PRIMARY KEY ("userId", "storeId")
);

CREATE INDEX "StoreFollow_storeId_createdAt_idx" ON "StoreFollow"("storeId", "createdAt");

ALTER TABLE "StoreFollow" ADD CONSTRAINT "StoreFollow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreFollow" ADD CONSTRAINT "StoreFollow_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "SellerStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
