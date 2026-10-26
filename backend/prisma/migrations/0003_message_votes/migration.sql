-- Up/down votes on assistant chat answers (one per user per message).

-- CreateTable
CREATE TABLE "message_votes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "type" "VoteType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_votes_user_id_message_id_key" ON "message_votes"("user_id", "message_id");

-- CreateIndex
CREATE INDEX "message_votes_message_id_idx" ON "message_votes"("message_id");

-- AddForeignKey
ALTER TABLE "message_votes" ADD CONSTRAINT "message_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_votes" ADD CONSTRAINT "message_votes_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
