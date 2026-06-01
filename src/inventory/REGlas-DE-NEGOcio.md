# Reglas de Negocio - Módulo de Inventario (FEAT-002)

## Visión General

Sistema de gestión de inventario para perfiles tipo `comercio`:
- **Fase A (MVP)**: Un local, control de cantidades (entradas/salidas)
- **Fase B**: Multi-sucursal con transferencias
- **Fase C**: Precios de compra/venta, márgenes, valoración de inventario

## 1. Tipos de Perfil y Acceso a Inventario

| Tipo Perfil | ¿Tiene Inventario? | Descripción |
|-------------|-------------------|-------------|
| `familiar` | No | Control de gastos personal/familia |
| `grupal` | No | Gastos compartidos con integrantes tipo Netflix |
| `comercio` | **Sí** | Negocios que necesitan control de stock |

**Regla**: Solo perfiles `comercio` pueden acceder a endpoints `/me/profiles/:id/inventory/*`.
Intentar usar inventario en otros tipos resulta en `400 Bad Request`.

## 2. Modelo de Multi-Sucursal

### Escenario 1: Usuario con una sola tienda (Fase A MVP)

```
Usuario
  └── Perfil "comercio" (Mi Tienda)
        └── InventoryItems (productos globales)
              └── StockMovement (entradas/salidas sin branchId)
```

- No hay sucursales creadas explícitamente.
- Todo el stock es global al perfil.
- El usuario es el dueño/gerente único.

### Escenario 2: Comercio con varias tiendas (Fase B)

```
Usuario
  └── Perfil "comercio" (Cadena de Tiendas)
        ├── Branch "Sucursal Centro" (gerente: Juan)
        ├── Branch "Sucursal Norte" (gerente: María)
        └── InventoryItems (productos globales al perfil)
              └── StockBalance por (item, branch)
              └── StockMovement con branchId
```

**Conceptos clave**:
- `Branch`: Sucursal física con nombre, dirección, gerente.
- `InventoryItem`: Producto global al perfil (mismo SKU en todas las sucursales).
- `StockBalance`: Stock por sucursal (tabla denormalizada para performance).
- `StockMovement`: Cada movimiento puede tener `branchId` (dónde ocurre).

## 3. Reglas de Productos (InventoryItem)

### 3.1 Creación
- Nombre obligatorio, máximo 120 caracteres.
- SKU opcional, máximo 50 caracteres, único por perfil.
- Unidad: string libre ('pieza', 'kg', 'caja', 'litro', 'metro').
- Stock mínimo: umbral para alertas (default 0).
- Stock inicial opcional: crea movimiento `INITIAL` automático.

### 3.2 SKU Único Parcial
```
if (SKU existe):
    debe ser único por perfil
else:
    permitido (null)
```

Pequeños comercios pueden no usar SKU formal.

### 3.3 Eliminación Restringida
No se puede eliminar un producto si:
- Tiene `currentStock > 0`, o
- Tiene movimientos registrados (`movements.length > 0`).

**Razón**: Los movimientos son histórico inmutable.

**Alternativa para descontinuar**:
- Ajustar stock a 0.
- Renombrar a "[DESCONTINUADO] Producto X".

## 4. Reglas de Movimientos (StockMovement)

### 4.1 Inmutabilidad
- Los movimientos **NO se borran**.
- Error de registro → compensar con movimiento de ajuste contrario.

### 4.2 Tipos y Signos

| Tipo | Signo en BD | Significado | Ejemplo |
|------|-------------|-------------|---------|
| `INITIAL` | + | Stock inicial al crear producto | +50 |
| `PURCHASE` | + | Compra a proveedor | +100 |
| `RETURN` | + | Devolución de cliente | +5 |
| `TRANSFER_IN` | + | Entrada por transferencia | +20 |
| `SALE` | - | Venta a cliente | -3 |
| `TRANSFER_OUT` | - | Salida por transferencia | -20 |
| `ADJUSTMENT` | +/- | Corrección de inventario físico | +2 o -5 |

### 4.3 Validación Anti-Negativo
Antes de crear cualquier movimiento que reduzca stock:
```
if (currentStock + proposedQty < 0):
    throw BadRequestException("Stock insuficiente")
```

Aplica tanto a stock global (Fase A) como por sucursal (Fase B).

### 4.4 Transferencias (Fase B)
Transferir de Sucursal A a B:
1. Crear movimiento `TRANSFER_OUT` en A (cantidad negativa).
2. Crear movimiento `TRANSFER_IN` en B (cantidad positiva).
3. Vincular ambos vía `relatedMovementId`.
4. Actualizar `StockBalance` en ambas sucursales.

**Restricciones**:
- Origen y destino deben ser diferentes.
- Origen debe tener stock suficiente.
- Stock global del producto no cambia (es movimiento interno).

## 5. Cálculo de Stock

### Opción Implementada: Denormalizado con Transacción
```typescript
// En transacción:
1. Crear StockMovement
2. InventoryItem.currentStock += quantity
```

**Ventajas**:
- Queries de listado ultrarrápidas (no SUM agregado).
- Simple de implementar.

**Riesgos**:
- Inconsistencia si falla transacción (manejado por Prisma).

### Opción Alternativa: Calculado (no implementada)
```sql
SELECT COALESCE(SUM(quantity), 0) as currentStock
FROM StockMovement
WHERE itemId = ?
```

Descartada por ahora por performance con muchos movimientos.

## 6. Alertas de Stock Bajo

Lógica:
```
isLowStock = currentStock <= minStock
```

Endpoints:
- `GET /inventory/items/low-stock` → lista solo productos bajos.
- `GET /inventory/items` → incluye flag `isLowStock` en cada item.

## 7. Integración con Gastos (Fase C Concepto)

**Relación conceptual**:
```
Gasto (compra de mercancía)
    └── vinculado a ──> StockMovement (entrada PURCHASE)
```

Campos en StockMovement:
- `expenseId`: nullable, referencia al gasto que generó la entrada.

**Flujo ideal futuro**:
1. Usuario registra gasto "Compra proveedor" con foto de factura.
2. OCR detecta items y cantidades.
3. Sistema sugiere crear movimientos de entrada.
4. Al aceptar, se vincula expense → movement.

## 8. Precios y Valoración (Fase C - "En el Aire")

### 8.1 ¿Qué falta definir?

El usuario mencionó que el control de precios "queda en el aire". Aquí están las opciones a decidir:

#### Opción A: Precio de Venta por Producto
```prisma
model InventoryItem {
  // ... campos existentes
  sellingPrice Decimal?  // Precio de venta sugerido
  currency     String     // USD, BS
}
```

**Pro**: Simple, útil para cotizaciones rápidas.
**Contra**: No refleja compras a diferentes precios.

#### Opción B: Precio Promedio Ponderado (FIFO/Weighted)
```prisma
model StockMovement {
  // ... campos existentes
  unitCost     Decimal?   // Costo unitario de esta entrada
  totalCost    Decimal?   // unitCost * quantity
}
```

**Pro**: Valoración real del inventario para contabilidad.
**Contra**: Complejo, requiere método de valoración definido.

#### Opción C: Sin Precios en Fase A/B
- Solo cantidades.
- Precios manejados en módulo de gastos (como ahora).
- Reporte de rentabilidad se hace fuera del sistema.

**Pro**: MVP más simple, menos campos.
**Contra**: No se sabe "cuánto vale" el inventario actual.

### 8.2 Recomendación del Agente

Para Fase A y B, **Opción C** (sin precios) es la más pragmática:
1. Completa el MVP de control de cantidades.
2. Permite que usuarios usen el sistema inmediatamente.
3. Precios pueden añadirse en Fase C sin migración compleja.

Para Fase C, considerar **Opción B** con costo promedio ponderado:
```
Costo promedio = (Valor total inventario + Valor nueva entrada) / (Cantidad total)
```

## 9. Casos de Uso Completos

### UC-1: Comerciante con 1 tienda registra venta

```
PRE: Perfil "Mi Kiosco" tipo comercio
     Producto "Coca-Cola 2L" con stock 50

1. POST /me/profiles/:id/inventory/movements
   {
     itemId: "coca-001",
     type: "SALE",
     quantity: 3,
     reason: "Venta cliente #1234"
   }

POST: Movimiento SALE -3 creado
      Stock actualizado a 47
```

### UC-2: Cadena con 2 sucursales transfiere stock

```
PRE: Perfil "SuperMart" tipo comercio
     Sucursal Centro: Coca-Cola stock 30
     Sucursal Norte: Coca-Cola stock 10

1. POST /me/profiles/:id/inventory/movements (o endpoint dedicado)
   Transferencia 10 unidades de Centro a Norte

POST: Movimiento TRANSFER_OUT -10 en Centro
      Movimiento TRANSFER_IN +10 en Norte
      StockBalance Centro: 20
      StockBalance Norte: 20
```

### UC-3: Corrección de inventario físico

```
PRE: Sistema dice stock 50, conteo físico da 48
     (2 unidades dañadas/expiradas)

1. POST /me/profiles/:id/inventory/movements/adjust
   {
     itemId: "coca-001",
     adjustmentQty: -2,
     reason: "Merma por productos expirados conteo abril"
   }

POST: Movimiento ADJUSTMENT -2 creado
      Stock actualizado a 48
```

## 10. Matriz de Permisos

| Acción | Dueño del Perfil | Admin Sistema |
|--------|------------------|---------------|
| Ver inventario | Sí | No (solo sus propios perfiles) |
| Crear producto | Sí | No |
| Editar producto | Sí | No |
| Eliminar producto* | Sí (si cumple condiciones) | No |
| Registrar movimiento | Sí | No |
| Ver movimientos | Sí | No |
| Crear sucursal (Fase B) | Sí | No |

\* Solo si stock=0 y sin movimientos.

## 11. Límites y Validaciones

| Campo | Límite | Validación |
|-------|--------|------------|
| name | 120 chars | @MinLength(1) @MaxLength(120) |
| sku | 50 chars, único por perfil | @MaxLength(50), constraint unique |
| unit | 20 chars | @MaxLength(20) |
| minStock | int >= 0 | @Min(0) @IsInt |
| quantity movimiento | int >= 1 | @Min(1) |
| reason | 200 chars | @MaxLength(200) |
| stock actual | int >= 0 | Validación anti-negativo |

---

*Documento vivo - actualizar al definir Fase C (precios) y requisitos adicionales.*
