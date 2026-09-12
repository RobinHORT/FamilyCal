@echo off
setlocal enabledelayedexpansion

title Yimly FamilyCal - Update

echo ========================================
echo       YIMLY FAMILYCAL UPDATE
echo ========================================
echo.

:: -----------------------------------------------------------------------------
:: [1/5] Checking repository and environment prerequisites
:: -----------------------------------------------------------------------------
echo [1/5] Checking repository and prerequisites...

:: 1. Verify Git is installed
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not found in PATH.
    echo Please install Git for Windows from https://git-scm.com/
    goto :fail
)

:: 2. Verify Docker CLI is installed
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not installed or not found in PATH.
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop/
    goto :fail
)

:: 3. Verify Docker Desktop engine is running
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker Desktop is not running.
    echo Please launch Docker Desktop and wait until the Docker engine has started.
    goto :fail
)

:: 4. Verify Docker Compose is available
docker compose version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker Compose is not available.
    echo Please ensure Docker Desktop includes Docker Compose v2.
    goto :fail
)

:: 5. Verify current directory is the Yimly FamilyCal Git repository
if not exist ".git" (
    echo [ERROR] Current directory is not a Git repository.
    echo Please run update.bat from the root directory of your cloned Yimly FamilyCal project.
    goto :fail
)

if not exist "docker-compose.yml" (
    echo [ERROR] docker-compose.yml not found in the current directory.
    echo Please ensure you are running this updater from the Yimly FamilyCal project root.
    goto :fail
)

:: 6. Verify Git remote points to the Yimly FamilyCal repository
set "REMOTE_URL="
for /f "delims=" %%u in ('git config --get remote.origin.url 2^>nul') do set "REMOTE_URL=%%u"
if defined REMOTE_URL (
    echo Current remote: !REMOTE_URL!
    echo !REMOTE_URL! | findstr /i "yimlyapp/Yimly-FamilyCal Yimly-FamilyCal" >nul
    if %ERRORLEVEL% neq 0 (
        echo [WARNING] Git remote URL does not match the official repository:
        echo   Expected: https://github.com/yimlyapp/Yimly-FamilyCal.git
        echo   Current:  !REMOTE_URL!
        echo Continuing update with currently configured remote...
    )
) else (
    echo [WARNING] No git remote origin configured.
)

:: 7. Check Docker Network requirements (if external network configured in compose)
findstr /i "cloudflared_bridge" docker-compose.yml >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Checking external Docker network 'cloudflared_bridge'...
    docker network inspect cloudflared_bridge >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Required external Docker network 'cloudflared_bridge' does not exist.
        echo Create it using: docker network create cloudflared_bridge
        goto :fail
    ) else (
        echo Docker network 'cloudflared_bridge' verified.
    )
)

:: 8. Check for uncommitted local changes (ignoring .env and backups/)
set "STATUS_TMP=%TEMP%\yimly_status_%RANDOM%.tmp"
set "FILTERED_TMP=%TEMP%\yimly_filtered_%RANDOM%.tmp"
git status --porcelain > "!STATUS_TMP!" 2>&1

:: Filter out allowed local-only directories/files: backups/ and .env
findstr /v /i /c:" backups/" /c:" backups\" /c:" backups" /c:" .env" "!STATUS_TMP!" > "!FILTERED_TMP!" 2>nul

set "DIRTY_COUNT=0"
for /f %%A in ('type "!FILTERED_TMP!" 2^>nul ^| find /c /v ""') do set "DIRTY_COUNT=%%A"
if !DIRTY_COUNT! gtr 0 (
    echo [ERROR] Uncommitted local changes detected in tracked repository files.
    echo.
    type "!FILTERED_TMP!"
    echo.
    echo Please commit or stash your local modifications before updating.
    del "!STATUS_TMP!" >nul 2>&1
    del "!FILTERED_TMP!" >nul 2>&1
    goto :fail
)
del "!STATUS_TMP!" >nul 2>&1
del "!FILTERED_TMP!" >nul 2>&1

echo All repository and environment checks passed.
echo.

:: -----------------------------------------------------------------------------
:: [2/5] Pulling latest GitHub changes
:: -----------------------------------------------------------------------------
echo [2/5] Pulling latest GitHub changes...

git pull
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to pull changes from GitHub.
    echo Please check your network connection and Git credentials.
    goto :fail
)

echo Repository updated successfully.
echo.

:: -----------------------------------------------------------------------------
:: [3/5] Backing up database and preserving environment configuration
:: -----------------------------------------------------------------------------
echo [3/5] Backing up database and checking configuration...

:: Generate timestamp formatted yyyy-MM-dd-HH-mm-ss
set "TIMESTAMP="
for /f "delims=" %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HH-mm-ss"') do set "TIMESTAMP=%%I"
if not defined TIMESTAMP (
    set "TIMESTAMP=%DATE:~10,4%-%DATE:~4,2%-%DATE:~7,2%-%TIME:~0,2%-%TIME:~3,2%-%TIME:~6,2%"
    set "TIMESTAMP=!TIMESTAMP: =0!"
)

:: Ensure local backups directory exists
if not exist "backups" (
    mkdir "backups" >nul 2>&1
)

set "BACKUP_FILE=backups\family-calendar-!TIMESTAMP!.db"
set "DB_FOUND=0"

:: Dynamically determine active container name (defaults to yimly-familycal)
set "CONTAINER_NAME=yimly-familycal"
for /f "delims=" %%c in ('docker compose -f docker-compose.yml ps -a --format "{{.Name}}" 2^>nul') do (
    if not "%%c"=="" set "CONTAINER_NAME=%%c"
)

:: 1. Attempt backup from active Docker container (!CONTAINER_NAME!)
echo Inspecting Docker container '!CONTAINER_NAME!' for SQLite database...

docker inspect !CONTAINER_NAME! >nul 2>&1
if %ERRORLEVEL% equ 0 (
    :: Try standard SQLite locations inside the container
    docker cp !CONTAINER_NAME!:/data/yimly_familycal.db "!BACKUP_FILE!" >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "DB_FOUND=1"
        docker cp !CONTAINER_NAME!:/data/yimly_familycal.db-wal "!BACKUP_FILE!-wal" >nul 2>&1
        docker cp !CONTAINER_NAME!:/data/yimly_familycal.db-shm "!BACKUP_FILE!-shm" >nul 2>&1
    ) else (
        docker cp !CONTAINER_NAME!:/data/family_calendar.sqlite "!BACKUP_FILE!" >nul 2>&1
        if %ERRORLEVEL% equ 0 (
            set "DB_FOUND=1"
            docker cp !CONTAINER_NAME!:/data/family_calendar.sqlite-wal "!BACKUP_FILE!-wal" >nul 2>&1
            docker cp !CONTAINER_NAME!:/data/family_calendar.sqlite-shm "!BACKUP_FILE!-shm" >nul 2>&1
        ) else (
            docker cp !CONTAINER_NAME!:/app/data/family_calendar.sqlite "!BACKUP_FILE!" >nul 2>&1
            if %ERRORLEVEL% equ 0 (
                set "DB_FOUND=1"
                docker cp !CONTAINER_NAME!:/app/data/family_calendar.sqlite-wal "!BACKUP_FILE!-wal" >nul 2>&1
                docker cp !CONTAINER_NAME!:/app/data/family_calendar.sqlite-shm "!BACKUP_FILE!-shm" >nul 2>&1
            )
        )
    )
)

:: Fallback check legacy container 'familycal' if database was not found in !CONTAINER_NAME!
if !DB_FOUND! equ 0 (
    docker inspect familycal >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        docker cp familycal:/data/yimly_familycal.db "!BACKUP_FILE!" >nul 2>&1
        if %ERRORLEVEL% equ 0 (
            set "DB_FOUND=1"
            docker cp familycal:/data/yimly_familycal.db-wal "!BACKUP_FILE!-wal" >nul 2>&1
            docker cp familycal:/data/yimly_familycal.db-shm "!BACKUP_FILE!-shm" >nul 2>&1
        ) else (
            docker cp familycal:/data/family_calendar.sqlite "!BACKUP_FILE!" >nul 2>&1
            if %ERRORLEVEL% equ 0 (
                set "DB_FOUND=1"
                docker cp familycal:/data/family_calendar.sqlite-wal "!BACKUP_FILE!-wal" >nul 2>&1
                docker cp familycal:/data/family_calendar.sqlite-shm "!BACKUP_FILE!-shm" >nul 2>&1
            ) else (
                docker cp familycal:/app/data/family_calendar.sqlite "!BACKUP_FILE!" >nul 2>&1
                if %ERRORLEVEL% equ 0 (
                    set "DB_FOUND=1"
                    docker cp familycal:/app/data/family_calendar.sqlite-wal "!BACKUP_FILE!-wal" >nul 2>&1
                    docker cp familycal:/app/data/family_calendar.sqlite-shm "!BACKUP_FILE!-shm" >nul 2>&1
                )
            )
        )
    )
)

:: Fallback check host filesystem if mounted directly
if !DB_FOUND! equ 0 (
    if exist "data\yimly_familycal.db" (
        copy /y "data\yimly_familycal.db" "!BACKUP_FILE!" >nul 2>&1
        if %ERRORLEVEL% equ 0 set "DB_FOUND=1"
    ) else if exist "data\family_calendar.sqlite" (
        copy /y "data\family_calendar.sqlite" "!BACKUP_FILE!" >nul 2>&1
        if %ERRORLEVEL% equ 0 set "DB_FOUND=1"
    )
)

if !DB_FOUND! equ 1 (
    if exist "!BACKUP_FILE!" (
        echo Database successfully backed up to: !BACKUP_FILE!
    ) else (
        echo [ERROR] Database backup verification failed.
        goto :fail
    )
) else (
    echo No existing database found to back up. A fresh database will be initialized on start.
    set "BACKUP_FILE="
)

:: Preserve .env configuration and secrets (NEVER overwrite existing .env)
if exist ".env" (
    echo Existing .env detected - preserving configuration and secrets.
) else (
    if exist ".env.example" (
        echo [NOTICE] No local .env file found. Creating .env from .env.example template...
        copy ".env.example" ".env" >nul
        echo Created .env template. Please review and configure your secrets.
    ) else (
        echo [NOTICE] No local .env file found.
    )
)
echo.

:: -----------------------------------------------------------------------------
:: [4/5] Rebuilding and restarting FamilyCal
:: -----------------------------------------------------------------------------
echo [4/5] Rebuilding and restarting FamilyCal...

echo Building updated Docker image using docker-compose.yml...
docker compose -f docker-compose.yml build --pull
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Docker image build failed.
    if defined BACKUP_FILE (
        echo Your database backup is preserved safely at: !BACKUP_FILE!
    )
    goto :fail
)

echo Starting updated FamilyCal service...
docker compose -f docker-compose.yml up -d
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to restart FamilyCal.
    if defined BACKUP_FILE (
        echo Your database backup is preserved safely at: !BACKUP_FILE!
    )
    goto :fail
)

:: Refresh actual container name in case Compose assigned a new instance name
for /f "delims=" %%c in ('docker compose -f docker-compose.yml ps --format "{{.Name}}" 2^>nul') do (
    if not "%%c"=="" set "CONTAINER_NAME=%%c"
)

:: Clean up dangling/unused build images safely
echo Pruning dangling images...
docker image prune -f >nul 2>&1

echo Container restart command completed.
echo.

:: -----------------------------------------------------------------------------
:: [5/5] Checking health
:: -----------------------------------------------------------------------------
echo [5/5] Checking health...
echo Waiting for container '!CONTAINER_NAME!' to become healthy...
echo.

set "IS_HEALTHY=0"
set "MAX_CHECKS=36"
set "CHECK_INTERVAL=5"

for /l %%i in (1,1,%MAX_CHECKS%) do (
    if !IS_HEALTHY! equ 0 (
        set "CURRENT_STATUS="
        set "IS_RUNNING="

        :: Query Docker's State.Health.Status directly using Go template
        for /f "delims=" %%s in ('docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" !CONTAINER_NAME! 2^>nul') do (
            set "CURRENT_STATUS=%%s"
        )

        if not defined CURRENT_STATUS set "CURRENT_STATUS=starting"

        if /i "!CURRENT_STATUS!"=="healthy" (
            echo   [Check %%i/%MAX_CHECKS%] Status: healthy
            set "IS_HEALTHY=1"
        ) else if /i "!CURRENT_STATUS!"=="unhealthy" (
            echo   [Check %%i/%MAX_CHECKS%] Status: unhealthy
            echo.
            echo [ERROR] Container '!CONTAINER_NAME!' reported UNHEALTHY status.
            goto :health_failed
        ) else if /i "!CURRENT_STATUS!"=="none" (
            :: Handle containers without Docker healthcheck configured (Requirement 5)
            for /f "delims=" %%r in ('docker inspect --format="{{.State.Running}}" !CONTAINER_NAME! 2^>nul') do set "IS_RUNNING=%%r"
            if /i "!IS_RUNNING!"=="true" (
                docker exec !CONTAINER_NAME! wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health >nul 2>&1
                if !ERRORLEVEL! equ 0 (
                    echo   [Check %%i/%MAX_CHECKS%] Status: healthy
                    set "IS_HEALTHY=1"
                ) else (
                    echo   [Check %%i/%MAX_CHECKS%] Status: starting
                    timeout /t %CHECK_INTERVAL% /nobreak >nul
                )
            ) else (
                echo   [Check %%i/%MAX_CHECKS%] Status: starting
                timeout /t %CHECK_INTERVAL% /nobreak >nul
            )
        ) else (
            echo   [Check %%i/%MAX_CHECKS%] Status: !CURRENT_STATUS!
            timeout /t %CHECK_INTERVAL% /nobreak >nul
        )
    )
)

if !IS_HEALTHY! neq 1 (
    echo.
    echo [ERROR] Container '!CONTAINER_NAME!' did not become healthy within 180 seconds.
    goto :health_failed
)

:: -----------------------------------------------------------------------------
:: SUCCESS
:: -----------------------------------------------------------------------------
echo.
echo ========================================
echo       YIMLY FAMILYCAL UPDATE
echo              SUCCESS
echo ========================================
echo.
echo FamilyCal container is healthy and running.
echo.

echo Running container status:
docker compose -f docker-compose.yml ps
echo.

echo Yimly FamilyCal Networking Summary:
echo Docker Container:           !CONTAINER_NAME!
echo Docker Network:             cloudflared_bridge
echo Network Alias:              familycal, yimly-familycal
echo Internal Port:              3000
echo Host Port:                  Not published
echo Cloudflare Tunnel Target:   http://familycal:3000
echo Public URL:                 https://familycal.robinhort.link
if defined BACKUP_FILE (
    if exist "!BACKUP_FILE!" (
        echo Database Backup File:       !BACKUP_FILE!
    )
)
echo.
goto :end

:: -----------------------------------------------------------------------------
:: HEALTH FAILURE
:: -----------------------------------------------------------------------------
:health_failed
echo.
echo ========================================
echo Yimly FamilyCal health check: FAILED
echo ========================================
echo.
echo Container status:
docker compose -f docker-compose.yml ps
echo.
echo Recent container logs (last 100 lines):
docker compose -f docker-compose.yml logs --tail=100
echo.
if defined BACKUP_FILE (
    if exist "!BACKUP_FILE!" (
        echo Database backup is preserved safely at: !BACKUP_FILE!
    )
)
echo.
echo [ERROR] FamilyCal health check failed.
goto :fail

:: -----------------------------------------------------------------------------
:: FAILURE EXIT
:: -----------------------------------------------------------------------------
:fail
echo.
echo ========================================
echo        UPDATE PROCESS FAILED
echo ========================================
echo Please review the diagnostic messages above.
echo.
pause
exit /b 1

:: -----------------------------------------------------------------------------
:: SUCCESS EXIT
:: -----------------------------------------------------------------------------
:end
pause
exit /b 0
