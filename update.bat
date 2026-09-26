@echo off
setlocal EnableExtensions

:: 1. Verify working directory
if not exist "docker-compose.yml" (
echo [ERROR] docker-compose.yml not found in current directory.
echo Please make sure you run update.bat from the root of the repository.
echo.
pause
exit /b 1
)

:: 2. Update code from GitHub
echo [1/7] Updating code from GitHub...

where git >nul 2>&1
if errorlevel 1 (
echo [ERROR] Git is not installed or not available in PATH.
pause
exit /b 1
)

if not exist ".git" (
echo [ERROR] This directory is not a Git repository.
pause
exit /b 1
)

echo Checking Git remote...
git remote -v
echo.

echo Fetching latest changes...
git fetch origin
if errorlevel 1 (
echo.
echo [ERROR] Could not fetch from Git.
echo Deployment stopped. Existing production services were NOT changed.
echo.
pause
exit /b 1
)

echo.
echo Synchronising local code with origin/main...

git checkout main
if errorlevel 1 (
echo [ERROR] Could not switch to main branch.
pause
exit /b 1
)

git reset --hard origin/main
if errorlevel 1 (
echo.
echo [ERROR] Could not synchronise with origin/main.
echo Deployment stopped. Existing production services were NOT changed.
echo.
pause
exit /b 1
)

git clean -fd
if errorlevel 1 (
echo.
echo [ERROR] Could not clean old repository files.
echo Deployment stopped.
echo.
pause
exit /b 1
)

echo [OK] Local code now matches origin/main.
echo.

:: 3. Check Docker and Docker Compose availability
echo [2/7] Checking Docker engine status...

where docker >nul 2>&1
if errorlevel 1 (
echo [ERROR] Docker is not installed or not available in PATH.
pause
exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
echo [ERROR] Docker is not currently running.
pause
exit /b 1
)

echo [OK] Docker daemon is running.

set "DOCKER_COMPOSE_CMD=docker compose"

docker compose version >nul 2>&1
if errorlevel 1 (
docker-compose version >nul 2>&1
if errorlevel 1 (
echo [ERROR] Docker Compose not found.
pause
exit /b 1
)
set "DOCKER_COMPOSE_CMD=docker-compose"
)

echo [OK] Using '%DOCKER_COMPOSE_CMD%'.
echo.

:: 4. Shared Docker network
echo [3/7] Verifying shared Docker network...

docker network inspect cloudflared_bridge >nul 2>&1

if errorlevel 1 (
docker network create cloudflared_bridge >nul 2>&1

if errorlevel 1 (
    echo [ERROR] Failed to create shared Docker network.
    pause
    exit /b 1
)

echo [OK] Created shared Docker network.

) else (
echo [OK] Existing shared Docker network detected and preserved.
)

echo.

:: 5. Environment and persistent storage
echo [4/7] Preparing environment and persistent storage...

if not exist ".env" (
if exist ".env.example" (
copy .env.example .env >nul
) else (
echo APP_ENV=production > .env
echo PORT=3000 >> .env
)
echo [OK] Created .env.
) else (
echo [OK] Existing .env preserved.
)

if not exist "data" mkdir data

echo [OK] Persistent storage directory verified.
echo.

:: 6. Build and deploy
echo [5/7] Building production image...
echo.

%DOCKER_COMPOSE_CMD% build
if errorlevel 1 (
echo.
echo [ERROR] Docker build failed.
echo Existing production services were NOT changed.
echo.
pause
exit /b 1
)

echo.
echo [OK] Production image built successfully.
echo.

echo [6/7] Deploying newly built image...
echo.

%DOCKER_COMPOSE_CMD% down
if errorlevel 1 (
echo.
echo [ERROR] Failed to stop existing services.
pause
exit /b 1
)

%DOCKER_COMPOSE_CMD% up -d --force-recreate --remove-orphans
if errorlevel 1 (
echo.
echo [ERROR] Failed to start production services.
echo.
%DOCKER_COMPOSE_CMD% ps
echo.
%DOCKER_COMPOSE_CMD% logs --tail=25
echo.
pause
exit /b 1
)

echo.
echo [OK] Production services started.
echo.

:: 7. Generic deployment verification
echo [7/7] Verifying deployment...

%DOCKER_COMPOSE_CMD% ps

if errorlevel 1 (
echo.
echo [ERROR] Could not verify running services.
echo.
%DOCKER_COMPOSE_CMD% logs --tail=25
echo.
pause
exit /b 1
)

echo.
echo [OK] Deployment completed.
echo.
echo GitHub source:
git remote get-url origin
echo.
echo Active Compose services:
%DOCKER_COMPOSE_CMD% ps --services
echo.
echo Persistent data:
echo ./data
echo.

pause
endlocal
