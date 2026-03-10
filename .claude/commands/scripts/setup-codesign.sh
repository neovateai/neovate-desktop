#!/bin/bash
# Create a self-signed codesigning certificate for local update testing.
# This only needs to run once per machine.
#
# Usage: bash scripts/setup-codesign.sh [identity-name]

set -euo pipefail

IDENTITY="${1:-Neovate Local Code Sign}"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Creating self-signed codesigning certificate: $IDENTITY"

# Generate key + cert with Code Signing EKU
cat > "$TMPDIR/cert.conf" <<CONF
[req]
distinguished_name = req_dn
x509_extensions = v3_cs
prompt = no

[req_dn]
CN = $IDENTITY

[v3_cs]
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
basicConstraints = critical, CA:false
CONF

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$TMPDIR/key.pem" \
  -out "$TMPDIR/cert.pem" \
  -days 3650 \
  -config "$TMPDIR/cert.conf" \
  2>/dev/null

# Export as PKCS12 (use -legacy for openssl 3.x compatibility)
openssl pkcs12 -export \
  -inkey "$TMPDIR/key.pem" \
  -in "$TMPDIR/cert.pem" \
  -out "$TMPDIR/cert.p12" \
  -passout pass:temp \
  -legacy \
  2>/dev/null

# Import into login keychain
security import "$TMPDIR/cert.p12" \
  -k ~/Library/Keychains/login.keychain-db \
  -P temp \
  -T /usr/bin/codesign

# Trust for code signing
security add-trusted-cert -p codeSign -k ~/Library/Keychains/login.keychain-db "$TMPDIR/cert.pem"

echo ""
echo "Verifying identity..."
if security find-identity -p codesigning | grep -q "$IDENTITY"; then
  echo "OK: '$IDENTITY' is available for codesigning"
else
  echo "ERROR: Certificate not found. Check Keychain Access."
  exit 1
fi
