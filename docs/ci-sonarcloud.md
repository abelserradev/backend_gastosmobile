# SonarCloud — backend_gastosmobile

## Error «Set the SONAR_TOKEN env variable»

El workflow [.github/workflows/sonarcloud.yml](../.github/workflows/sonarcloud.yml) necesita un token de SonarCloud en GitHub Actions.

## Configuración (una vez)

1. [SonarCloud](https://sonarcloud.io) con la cuenta GitHub **abelserradev**.
2. **My Account → Security → Generate Tokens** → copia el token.
3. Importa el repo si no existe:
   - **+ → Analyze new project → From GitHub → `backend_gastosmobile`**
   - Project key: `abelserradev_backend_gastosmobile` ([sonar-project.properties](../sonar-project.properties)).
4. GitHub → **backend_gastosmobile** → **Settings → Secrets and variables → Actions**:
   - Secret `SONAR_TOKEN` = token de SonarCloud.

Puedes usar **el mismo token** que en `frontend_gastosmobile` si la org SonarCloud es la misma; cada repo debe tener el secret definido (o un secret de organización `SONAR_TOKEN`).

5. Re-ejecuta el workflow en **Actions**.

## CI sin token

Tests + cobertura Jest siguen ejecutándose; el scan se omite con warning hasta que exista `SONAR_TOKEN`.
