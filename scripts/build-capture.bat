@echo off
setlocal
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" || exit /b 1
set "ROOT=%~dp0.."
set "OUT=%ROOT%\native\bin"
if not exist "%OUT%" mkdir "%OUT%"
cl /nologo /EHsc /std:c++17 /O2 /W3 /DUNICODE /D_UNICODE /Fo"%OUT%\\" /Fe"%OUT%\mixline-capture.exe" "%ROOT%\native\mixline-capture\main.cpp"
exit /b %ERRORLEVEL%
