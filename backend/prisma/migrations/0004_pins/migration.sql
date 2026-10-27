-- Right-rail pins (Promoted records) with impression/click analytics.

-- CreateEnum
CREATE TYPE "PinMode" AS ENUM ('FORCED', 'RELATIONAL');

-- CreateEnum
CREATE TYPE "PinEventType" AS ENUM ('IMPRESSION', 'CLICK');

-- CreateTable
CREATE TABLE "pinned_records" (
    "id" TEXT NOT NULL,
    "knowledge_record_id" TEXT NOT NULL,
    "mode" "PinMode" NOT NULL DEFAULT 'FORCED',
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "pinned_by" TEXT NOT NULL,
    "impression_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pinned_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pin_events" (
    "id" TEXT NOT NULL,
    "pin_id" TEXT NOT NULL,
    "type" "PinEventType" NOT NULL,
    "user_id" TEXT,
    "context" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pin_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pinned_records_knowledge_record_id_key" ON "pinned_records"("knowledge_record_id");

-- CreateIndex
CREATE INDEX "pinned_records_active_sort_order_idx" ON "pinned_records"("active", "sort_order");

-- CreateIndex
CREATE INDEX "pinned_records_mode_idx" ON "pinned_records"("mode");

-- CreateIndex
CREATE INDEX "pin_events_pin_id_type_created_at_idx" ON "pin_events"("pin_id", "type", "created_at");

-- AddForeignKey
ALTER TABLE "pinned_records" ADD CONSTRAINT "pinned_records_knowledge_record_id_fkey" FOREIGN KEY ("knowledge_record_id") REFERENCES "knowledge_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pinned_records" ADD CONSTRAINT "pinned_records_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_events" ADD CONSTRAINT "pin_events_pin_id_fkey" FOREIGN KEY ("pin_id") REFERENCES "pinned_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pin_events" ADD CONSTRAINT "pin_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
