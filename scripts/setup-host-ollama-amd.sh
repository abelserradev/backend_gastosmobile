#!/usr/bin/env bash
# Configura el Ollama de systemd para AMD Radeon (RX 7600) vía Vulkan/RADV.
# Requiere sudo. No toca NVIDIA (la Quadro ya no está en este host).
set -euo pipefail

DROP_IN_DIR=/etc/systemd/system/ollama.service.d
# Lexical order matters: override.conf (127.0.0.1) must NOT win over this file.
DROP_IN_FILE="${DROP_IN_DIR}/zz-amd-vulkan.conf"
LEGACY_DROP_IN="${DROP_IN_DIR}/amd-vulkan.conf"
HOST_OVERRIDE="${DROP_IN_DIR}/override.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecutá con sudo: sudo bash $0"
  exit 1
fi

if [[ ! -e /dev/dri/renderD128 ]]; then
  echo "No hay /dev/dri/renderD128 — ¿está el driver amdgpu cargado?"
  exit 1
fi

if [[ ! -e /dev/kfd ]]; then
  echo "WARN: falta /dev/kfd (ROCm compute). Vulkan igual puede funcionar."
fi

install -d -m 0755 "${DROP_IN_DIR}"

# Bind 0.0.0.0 para que Coolify/Docker lleguen por host.docker.internal.
# OLLAMA_VULKAN=1: este binario de Ollama trae ggml-vulkan (no ROCm).
cat > "${DROP_IN_FILE}" <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_VULKAN=1"
Environment="OLLAMA_KEEP_ALIVE=30m"
EOF

# Un override viejo fijaba loopback y ganaba por orden alfabético (override > amd-*).
if [[ -f "${HOST_OVERRIDE}" ]] && grep -q 'OLLAMA_HOST=127.0.0.1' "${HOST_OVERRIDE}"; then
  echo "Actualizando ${HOST_OVERRIDE}: 127.0.0.1 → 0.0.0.0 (acceso desde Docker)"
  sed -i 's/OLLAMA_HOST=127\.0\.0\.1:11434/OLLAMA_HOST=0.0.0.0:11434/' "${HOST_OVERRIDE}"
fi

# Evitar drop-in duplicado del primer intento
if [[ -f "${LEGACY_DROP_IN}" ]]; then
  rm -f "${LEGACY_DROP_IN}"
  echo "Eliminado drop-in legacy: ${LEGACY_DROP_IN}"
fi

systemctl daemon-reload
systemctl restart ollama

sleep 2
systemctl is-active --quiet ollama || {
  echo "ollama no quedó active — revisá: journalctl -u ollama -n 50 --no-pager"
  exit 1
}

echo "Drop-in aplicado: ${DROP_IN_FILE}"
echo "Buscá en logs: library=Vulkan y AMD Radeon RX 7600"
journalctl -u ollama -n 40 --no-pager | grep -Ei 'Vulkan|vram|RX 7600|inference compute|OLLAMA_HOST' || true

echo
ss -lntp 2>/dev/null | grep 11434 || true
echo
echo "Modelos OCR/chat (si faltan): ollama pull glm-ocr && ollama pull llama3.2"
