; Windows installer for the Release build (Inno Setup 6).
; Build it with `npm run package:windows`, which passes the version from package.json.
; Packs build/windows/proj/Release: the game executable, its DLLs and Resources/, without link
; outputs (.lib/.exp) and the debug C runtime that Cocos copies next to every build.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Plants vs. Zombies"
#define AppExe "pvz-remake.exe"
#define Root AddBackslash(SourcePath) + "..\.."
#define Release Root + "\build\windows\proj\Release"
#define Icon Root + "\native\engine\win64\res\game.ico"

[Setup]
; Keep AppId fixed: it lets a newer installer upgrade an existing installation.
AppId={{3A58FFFC-D614-4590-993A-0A6A803A2281}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Installs for all users by default; the dialog also offers a per-user install without admin rights.
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#Root}\dist
OutputBaseFilename=pvz-remake-v{#AppVersion}-windows-x64-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
#if FileExists(Icon)
SetupIconFile={#Icon}
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#Release}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#Release}\*.dll"; DestDir: "{app}"; Excludes: "msvcp140d.dll,ucrtbased.dll,vcruntime140d.dll,vcruntime140_1d.dll"; Flags: ignoreversion
Source: "{#Release}\Resources\*"; DestDir: "{app}\Resources"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
