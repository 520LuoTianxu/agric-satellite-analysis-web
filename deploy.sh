#!/bin/sh

# Next.js standalone 发布脚本。
# 与静态 dist 发布不同，Next.js 需要同时保留 server.js、public 和 .next/static。
set -eu

APP_DIR="${APP_DIR:-/data/mwbase/agric-satellite-analysis-web}"
BACKUP_DIR="${BACKUP_DIR:-/data/mwbase/backup/bak-agric-satellite-analysis-web/rdc}"
RELEASE_BACKUP_DIR="${RELEASE_BACKUP_DIR:-/data/mwbase/backup/bak-agric-satellite-analysis-web/releases}"
PACKAGE_NAME="${PACKAGE_NAME:-package.tgz}"
SERVICE_NAME="${SERVICE_NAME:-agric-satellite-analysis-web}"
PACKAGE_PATH="$BACKUP_DIR/$PACKAGE_NAME"
TIMESTAMP="$(date '+%Y-%m-%d-%H-%M-%S')"

if [ ! -f "$PACKAGE_PATH" ]; then
    echo "ERROR: deployment package not found: $PACKAGE_PATH" >&2
    exit 1
fi

mkdir -p "$APP_DIR" "$BACKUP_DIR" "$RELEASE_BACKUP_DIR"

# 保留本次部署包和上一版本，便于排查或回滚；只操作约定的应用目录。
cp "$PACKAGE_PATH" "$BACKUP_DIR/$TIMESTAMP.tgz"
if [ -f "$APP_DIR/server.js" ]; then
    tar -czf "$RELEASE_BACKUP_DIR/$TIMESTAMP.tgz" -C "$APP_DIR" .
fi

STAGING_DIR="$(mktemp -d "${APP_DIR}.staging.XXXXXX")"
RELEASE_DIR="$STAGING_DIR/release"
trap 'rm -rf "$STAGING_DIR"' EXIT INT TERM

tar -xzf "$PACKAGE_PATH" -C "$STAGING_DIR"
mkdir -p "$RELEASE_DIR"

if [ -f "$STAGING_DIR/server.js" ]; then
    # 构建包已经是 standalone 根目录。
    cp "$STAGING_DIR/server.js" "$RELEASE_DIR/"
    [ -d "$STAGING_DIR/node_modules" ] && cp -R "$STAGING_DIR/node_modules" "$RELEASE_DIR/"
    [ -f "$STAGING_DIR/package.json" ] && cp "$STAGING_DIR/package.json" "$RELEASE_DIR/"
    [ -d "$STAGING_DIR/public" ] && cp -R "$STAGING_DIR/public" "$RELEASE_DIR/"
    [ -d "$STAGING_DIR/.next" ] && cp -R "$STAGING_DIR/.next" "$RELEASE_DIR/"
elif [ -f "$STAGING_DIR/.next/standalone/server.js" ]; then
    # 构建包保留了 .next/standalone 目录层级，先整体复制以保留其中的静态资源。
    cp -R "$STAGING_DIR/.next/standalone/." "$RELEASE_DIR/"

    # 某些打包方式会把 public 放在 standalone 同级目录，需要补充到运行目录。
    [ -d "$STAGING_DIR/public" ] && cp -R "$STAGING_DIR/public" "$RELEASE_DIR/"

    # 完整仓库打包时静态目录在 standalone 同级，只有这种情况才需要单独复制。
    if [ -d "$STAGING_DIR/.next/static" ]; then
        mkdir -p "$RELEASE_DIR/.next"
        cp -R "$STAGING_DIR/.next/static" "$RELEASE_DIR/.next/"
    fi
else
    echo "ERROR: server.js or .next/standalone/server.js not found in package" >&2
    exit 1
fi

if [ ! -f "$RELEASE_DIR/server.js" ]; then
    echo "ERROR: normalized release does not contain server.js" >&2
    exit 1
fi
if [ ! -d "$RELEASE_DIR/.next/static" ]; then
    echo "ERROR: normalized release does not contain .next/static" >&2
    exit 1
fi

# 先删除旧目录，再切换新版本；旧版本已在 releases 目录留存。
rm -rf "$APP_DIR"
mv "$RELEASE_DIR" "$APP_DIR"

# 如果服务器使用 PM2 或 systemd，则自动重启；未配置进程管理器时只完成文件发布。
if [ "${SKIP_RESTART:-0}" != "1" ]; then
    if command -v pm2 >/dev/null 2>&1; then
        pm2 delete "$SERVICE_NAME" >/dev/null 2>&1 || true
        pm2 start "$APP_DIR/server.js" --name "$SERVICE_NAME" --cwd "$APP_DIR" --update-env
        pm2 save >/dev/null 2>&1 || true
    elif [ -n "${SYSTEMD_SERVICE:-}" ] && command -v systemctl >/dev/null 2>&1; then
        systemctl restart "$SYSTEMD_SERVICE"
    else
        echo "WARN: files deployed, but no PM2/systemd service was restarted"
        echo "      set SYSTEMD_SERVICE or restart node $APP_DIR/server.js manually"
    fi
fi

echo "Deployment completed: $APP_DIR"
