-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "rotated_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token"("family_id");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "invite_token_user_id_idx" ON "invite_token"("user_id");

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Pre-tenant auth lookups (auth-security + prisma-rls-guardian territory)
--
-- Login/refresh happen BEFORE a tenant context exists, but "user" has
-- RLS + FORCE. Narrow escape hatch: SECURITY DEFINER functions owned by
-- caresync_auth (NOLOGIN, BYPASSRLS). The app role can only EXECUTE these
-- two read-only functions — it still cannot touch "user" directly without
-- tenant context.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_auth') THEN
    CREATE ROLE caresync_auth NOLOGIN BYPASSRLS;
  END IF;
END $$;

GRANT SELECT ON "user" TO caresync_auth;

CREATE OR REPLACE FUNCTION auth_users_by_email(p_email text)
RETURNS SETOF "user"
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$ SELECT * FROM "user" WHERE lower(email) = lower(p_email) $$;

CREATE OR REPLACE FUNCTION auth_user_by_id(p_id uuid)
RETURNS SETOF "user"
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$ SELECT * FROM "user" WHERE id = p_id $$;

ALTER FUNCTION auth_users_by_email(text) OWNER TO caresync_auth;
ALTER FUNCTION auth_user_by_id(uuid) OWNER TO caresync_auth;

REVOKE ALL ON FUNCTION auth_users_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_user_by_id(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'caresync_app') THEN
    GRANT EXECUTE ON FUNCTION auth_users_by_email(text) TO caresync_app;
    GRANT EXECUTE ON FUNCTION auth_user_by_id(uuid) TO caresync_app;
  END IF;
END $$;
