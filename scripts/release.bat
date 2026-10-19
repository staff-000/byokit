@echo off
REM ==============================================================================
REM byokit Release Batch Script (Windows CMD)
REM ==============================================================================
REM This batch script guides and executes the release process on Windows:
REM   1. Pre-flight verification (clean workspace, git pull, test suites, types)
REM   2. Version bumping across package.json, packages/byokit, and packages/python
REM   3. Multi-package publishing (npm, PyPI) or triggering GitHub Actions workflow
REM   4. Git commit, tag, push, and GitHub release creation
REM   5. Post-release registry verification
REM
REM ------------------------------------------------------------------------------
REM Usage:
REM   scripts\release.bat [patch|minor|major|<version>] [options]
REM
REM Examples:
REM   scripts\release.bat patch --dry-run     :: Simulate release without publishing
REM   scripts\release.bat patch --trigger     :: Recommended: trigger GitHub Actions workflow
REM   scripts\release.bat patch --local       :: Publish directly from this machine
REM   scripts\release.bat minor               :: Interactive mode
REM
REM Options:
REM   --dry-run    Simulate release without modifying registries or pushing git tags
REM   --trigger    Trigger GitHub Actions release workflow (uses GitHub Secrets)
REM   --local      Publish directly from this machine (requires local npm & PyPI tokens)
REM   --skip-tests Skip the pre-flight test suites
REM ------------------------------------------------------------------------------

setlocal enabledelayedexpansion

REM Set project root to parent directory of this script
cd /d "%~dp0\.."

set TARGET=%~1
if "%TARGET%"=="" set TARGET=patch
set OPTION=%~2

echo ======================================================
echo 🚀 byokit Release Automation (Windows Batch)
echo ======================================================
echo Target bump: %TARGET%
echo Option:      %OPTION%
echo.

REM ------------------------------------------------------------------------------
REM Step 1: Pre-flight Checks (Git status)
REM ------------------------------------------------------------------------------
echo [Step 1] Checking git status...
for /f "tokens=*" %%i in ('git status --porcelain') do (
    echo ❌ Error: Uncommitted changes detected in working tree.
    echo Please commit or stash your changes before releasing.
    git status -s
    exit /b 1
)
echo   [OK] Git working directory is clean.

REM ------------------------------------------------------------------------------
REM Step 2: Pre-flight Verification (Tests & Build)
REM ------------------------------------------------------------------------------
if "%OPTION%"=="--skip-tests" (
    echo   [WARN] Skipping tests due to --skip-tests flag.
) else (
    echo [Step 2] Running pre-flight verification suite...
    echo   - Running JS test suite (npm test)...
    call npm test || (echo ❌ npm test failed! && exit /b 1)

    echo   - Running Python test suite (npm run test:python)...
    call npm run test:python || (echo ❌ Python tests failed! && exit /b 1)

    echo   - Running TypeScript typecheck (npm run typecheck)...
    call npm run typecheck || (echo ❌ TypeScript check failed! && exit /b 1)

    echo   - Running Python typecheck (npm run typecheck:python)...
    call npm run typecheck:python || (echo ❌ Python pyright check failed! && exit /b 1)

    echo   - Building static site (npm run site:build)...
    call npm run site:build || (echo ❌ Site build failed! && exit /b 1)

    echo   [OK] All pre-flight tests and checks passed.
)

REM ------------------------------------------------------------------------------
REM Step 3: Execute Release
REM ------------------------------------------------------------------------------
echo.
echo [Step 3] Executing release...

if "%OPTION%"=="--dry-run" (
    echo Running simulated release (--dry-run)...
    node scripts\release.mjs %TARGET% --dry-run
    goto done
)

if "%OPTION%"=="--trigger" (
    echo Triggering GitHub Actions release workflow...
    node scripts\trigger-release.mjs %TARGET%
    goto done
)

if "%OPTION%"=="--local" (
    echo Running full local release (publish to npm and PyPI, push tags)...
    node scripts\release.mjs %TARGET% --push
    goto verify
)

REM Interactive prompt if no option given
echo Select release mode:
echo   1. Dry Run     (simulate release without publishing)
echo   2. GitHub CI   (trigger GitHub Actions release workflow - recommended)
echo   3. Local Live  (publish to npm/PyPI directly and push tag)
echo   4. Cancel
set /p CHOICE="Enter choice (1-4): "

if "%CHOICE%"=="1" (
    node scripts\release.mjs %TARGET% --dry-run
    goto done
)
if "%CHOICE%"=="2" (
    node scripts\trigger-release.mjs %TARGET%
    goto done
)
if "%CHOICE%"=="3" (
    node scripts\release.mjs %TARGET% --push
    goto verify
)
echo Release cancelled.
exit /b 0

:verify
echo.
echo [Step 4] Verifying published packages on npm and PyPI...
timeout /t 5 /nobreak >nul
node scripts\test-released-packages.mjs

:done
echo.
echo ======================================================
echo 🎉 Release process finished!
echo ======================================================

