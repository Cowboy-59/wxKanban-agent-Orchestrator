ALTER TABLE "marketingassets" ADD COLUMN "category" varchar(50) DEFAULT 'open' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_marketingassets_category" ON "marketingassets" USING btree ("category");
