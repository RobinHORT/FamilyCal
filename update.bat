@echo off
setlocal enabledelayedexpansion

title FamilyCal - Update

echo ========================================
echo          FAMILY CAL UPDATE
echo ========================================
echo.

:: [1/5] Checking repository...
echo [1/5] Checking repository...
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not found in PATH.
    echo Please install Git for Windows to enable repository updates.
    echo.
    pause
    exit /b 1
)

where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker is not installed or not found in PATH.
    echo Please ensure Docker Desktop is installed and running.
    echo.
    pause
    exit /b 1
)

docker compose version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    docker-compose version >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Docker Compose is not available.
        echo Please ensure Docker Desktop is running with Docker Compose enabled.
        echo.
        pause
        exit /b 1
    )
)

docker network inspect cloudflared_bridge >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] External Docker network 'cloudflared_bridge' does not exist.
    echo Manual Cloudflare network setup is required.
    echo.
    pause
    exit /b 1
)

if not exist "docker-compose.yml" (
    echo [ERROR] docker-compose.yml was not found.
    echo Expected:
    echo C:\DockerApps\FamilyCal\docker-compose.yml
    echo.
    pause
    exit /b 1
)

echo Repository and Docker verified.
echo.

:: [2/5] Pulling latest GitHub changes...
echo [2/5] Pulling latest GitHub changes...
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to pull changes from remote GitHub repository.
    echo Please check your network connection and Git credentials.
    echo.
    pause
    exit /b 1
)
echo.

:: Verify compose file after Git pull
if not exist "docker-compose.yml" (
    echo [ERROR] docker-compose.yml is missing after Git pull.
    echo.
    pause
    exit /b 1
)

:: [3/5] Rebuilding Docker image...
echo [3/5] Rebuilding Docker image...
docker compose -f docker-compose.yml build --pull
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Build with --pull failed, attempting standard build...
    docker compose -f docker-compose.yml build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Docker image build failed.
        echo Review the error messages above for details.
        echo.
        pause
        exit /b 1
    )
)
echo.

:: [4/5] Restarting FamilyCal...
echo [4/5] Restarting FamilyCal...
docker compose -f docker-compose.yml up -d
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to restart FamilyCal containers.
    echo.
    pause
    exit /b 1
)

docker image prune -f >nul 2>&1
echo FamilyCal container restarted successfully.
echo.

:: [5/5] Checking health...
echo [5/5] Checking FamilyCal health...
set "HEALTHY=0"
set "ELAPSED=0"

:HEALTH_LOOP
if !ELAPSED! geq 60 goto HEALTH_FAILED

set /a "ELAPSED+=5"
echo Waiting for FamilyCal health... !ELAPSED!s
timeout /t 5 >nul

for /f "delims=" %%s in ('docker inspect --format="{{.State.Health.Status}}" yimly-familycal 2^>nul') do (
    if "%%s"=="healthy" (
        set "HEALTHY=1"
        goto HEALTH_PASSED
    )
    if "%%s"=="unhealthy" (
        goto HEALTH_FAILED
    )
)

goto HEALTH_LOOP

:HEALTH_FAILED
echo.
echo FamilyCal health check: FAILED
echo.
docker compose -f docker-compose.yml ps
echo.
docker compose -f docker-compose.yml logs --tail=100 yimly-familycal
echo.
pause
exit /b 1

:HEALTH_PASSED
echo.
echo FamilyCal health check: HEALTHY
echo.
echo ========================================
echo FamilyCal update complete.
echo ========================================
echo.
docker compose -f docker-compose.yml ps
echo.
echo FamilyCal Networking Summary:
echo - Compose Service: yimly-familycal
echo - Docker Network: cloudflared_bridge
echo - Network Alias: familycal
echo - Internal Port: 3000
echo - Published Host Ports: None
echo - Cloudflare Tunnel Target: http://familycal:3000
echo.
pause