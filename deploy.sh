#!/bin/sh

# 静态站点发布脚本：将 Next.js 的 out/ 内容发布到 Nginx 静态目录。
set -eu

APP_DIR="${APP_DIR:-/data/mwbase/agric-satellite-analysis-web}"
BACKUP_DIR="${BACKUP_DIR:-/data/mwbase/backup/bak-agric-satellite-analysis-web/rdc}"
RELEASE_BACKUP_DIR="${RELEASE_BACKUP_DIR:-/data/mwbase/backup/bak-agric-satellite-analysis-web/releases}"
PACKAGE_NAME="${PACKAGE_NAME:-package.tgz}"
PACKAGE_PATH="$BACKUP_DIR/$PACKAGE_NAME"
TIMESTAMP="$(date '+%Y-%m-%d-%H-%M-%S')"

if [ ! -f "$PACKAGE_PATH" ]; then
    echo "ERROR: deployment package not found: $PACKAGE_PATH" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR" "$RELEASE_BACKUP_DIR" "$(dirname "$APP_DIR")"

# 保留本次部署包，旧版本在新包校验通过后再移动，避免坏包导致线上目录先被移走。
cp "$PACKAGE_PATH" "$BACKUP_DIR/$TIMESTAMP.tgz"

STAGING_DIR="$(mktemp -d "${APP_DIR}.staging.XXXXXX")"
RELEASE_DIR="$STAGING_DIR/release"
trap 'rm -rf "$STAGING_DIR"' EXIT INT TERM

tar -xzf "$PACKAGE_PATH" -C "$STAGING_DIR"
mkdir -p "$RELEASE_DIR"

if [ -d "$STAGING_DIR/out" ]; then
    # 平台通常会保留 out/ 目录层级。
    STATIC_DIR="$STAGING_DIR/out"
elif [ -f "$STAGING_DIR/index.html" ]; then
    # 兼容平台直接打包 out/ 内容的情况。
    STATIC_DIR="$STAGING_DIR"
else
    echo "ERROR: out/ or index.html not found in package" >&2
    exit 1
fi

if [ ! -f "$STATIC_DIR/index.html" ] && [ ! -f "$STATIC_DIR/zh/index.html" ]; then
    echo "ERROR: static package does not contain index.html or zh/index.html" >&2
    exit 1
fi

cp -R "$STATIC_DIR/." "$RELEASE_DIR/"
if [ -d "$APP_DIR" ]; then
    # 保留旧版本，便于排查或回滚；只操作约定的应用目录。
    mv "$APP_DIR" "$RELEASE_BACKUP_DIR/$TIMESTAMP"
fi
mv "$RELEASE_DIR" "$APP_DIR"

echo "Static deployment completed: $APP_DIR"
