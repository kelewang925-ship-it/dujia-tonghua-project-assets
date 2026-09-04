param([string]$Root = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'

$required = @('index.html', 'README.md', '.gitignore', '.nojekyll',
  '.github/workflows/pages.yml', 'scripts/build-public-manifest.ps1',
  'scripts/verify-public-site.ps1', 'scripts/test-showcase.mjs', 'public-files.txt')
$manifestPath = Join-Path $Root 'public-files.txt'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'public-files.txt is missing' }
$manifest = @(Get-Content -LiteralPath $manifestPath -Encoding UTF8 | Where-Object { $_.Trim() })
foreach ($path in $required) {
  if ($path -notin $manifest) { throw "Required public file is absent from manifest: $path" }
}
foreach ($path in $manifest) {
  $full = [IO.Path]::GetFullPath((Join-Path $Root $path))
  $rootFull = [IO.Path]::GetFullPath($Root) + [IO.Path]::DirectorySeparatorChar
  if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes root: $path" }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing public file: $path" }
}

$html = Get-Content -LiteralPath (Join-Path $Root 'index.html') -Raw -Encoding UTF8
$refs = [regex]::Matches($html, '(?:src|href)="([^"]+)"') |
  ForEach-Object { [uri]::UnescapeDataString($_.Groups[1].Value) } |
  Where-Object { $_ -notmatch '^(?:https?:|#|mailto:|javascript:)' } |
  Sort-Object -Unique
foreach ($ref in $refs) {
  if ($ref -notin $manifest) { throw "HTML reference is absent from manifest: $ref" }
}
if (Test-Path -LiteralPath (Join-Path $Root '.git')) {
  $tracked = @(git -C $Root ls-files)
  $unexpected = @($tracked | Where-Object { $_ -notin $manifest })
  if ($unexpected.Count) { throw "Unexpected tracked files: $($unexpected -join ', ')" }
}

$textFiles = $manifest | Where-Object { [IO.Path]::GetExtension($_) -in @('.html', '.md', '.mmd', '.json', '.yml', '.yaml', '.ps1', '.mjs', '') }
$secretPattern = '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|SUPABASE_(?:ANON_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*[^\s]+)'
foreach ($path in $textFiles) {
  $value = Get-Content -LiteralPath (Join-Path $Root $path) -Raw -Encoding UTF8
  if ($value -match $secretPattern) { throw "Potential secret in public file: $path" }
  if ($value -match '[A-Z]:\\(?:Users|projectCode)\\') { throw "Local absolute path in public file: $path" }
}

"PASS: $($manifest.Count) public files; $($refs.Count) local references; no path escape, unexpected tracked file, or secret pattern."
