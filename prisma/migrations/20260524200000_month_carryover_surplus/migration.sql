-- Saldo sobrante del mes anterior sumado al presupuesto del mes vigente (USD).
ALTER TABLE "UserPreference" ADD COLUMN "carryoverUsd" DECIMAL(14,2) NOT NULL DEFAULT 0;
