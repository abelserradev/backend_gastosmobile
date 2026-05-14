-- Mes de ingreso confirmado: alinear usuarios existentes al mes calendario vigente (TZ del servidor; compose usa America/Caracas).
ALTER TABLE "UserPreference" ADD COLUMN "incomeReferenceMonth" DATE;

UPDATE "UserPreference"
SET "incomeReferenceMonth" = date_trunc('month', CURRENT_DATE)::date
WHERE "incomeReferenceMonth" IS NULL;
