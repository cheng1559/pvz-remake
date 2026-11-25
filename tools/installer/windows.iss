; Windows installer for the Release build (Inno Setup 6).
; Build it with `npm run package:windows`, which passes the version from package.json and, as Files, the folder of
; the files it picks from build/windows/proj/Release for players, the zip's too.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef Files
  #error Files is the folder of the files to install, which npm run package:windows passes
#endif
#define AppName "Plants vs. Zombies"
#define AppExe "pvz-remake.exe"
#define Root AddBackslash(SourcePath) + "..\.."
#define Icon Root + "\native\engine\win64\res\game.ico"

[Setup]
; Keep AppId fixed: it lets a newer installer upgrade an existing installation.
AppId={{3A58FFFC-D614-4590-993A-0A6A803A2281}
AppName={#AppName}
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
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
Source: "{#Files}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#StringChange(AppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
