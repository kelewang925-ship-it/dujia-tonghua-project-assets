param([string]$Root = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'

$rootFull = [IO.Path]::GetFullPath($Root)
$rootPrefix = $rootFull + [IO.Path]::DirectorySeparatorChar
$required = @('index.html', 'backend-design.html', 'README.md', '.gitignore', '.nojekyll',
  '.github/workflows/pages.yml', 'scripts/build-public-manifest.ps1',
  'scripts/verify-public-site.ps1', 'scripts/test-showcase.mjs',
  'scripts/test-backend-design.mjs', 'scripts/test-backend-docs.mjs', 'public-files.txt')

function ConvertTo-LocalPath {
  param([string]$Reference, [string]$FromFile)

  $decoded = [uri]::UnescapeDataString($Reference)
  if ($decoded -match '^(?:https?:|data:|#|mailto:|tel:|javascript:)') { return $null }
  $decoded = $decoded -replace '[?#].*$', ''
  if ([string]::IsNullOrWhiteSpace($decoded)) { return $null }

  $fromFull = [IO.Path]::GetFullPath((Join-Path $rootFull $FromFile))
  $full = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetDirectoryName($fromFull)) $decoded))
  if (-not $full.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes root: $FromFile -> $Reference"
  }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    throw "Missing referenced file: $FromFile -> $Reference"
  }
  return $full.Substring($rootPrefix.Length) -replace '\\', '/'
}

function Get-DirectHtmlReferences {
  param([string]$HtmlFile)

  $html = Get-Content -LiteralPath (Join-Path $rootFull $HtmlFile) -Raw -Encoding UTF8
  [regex]::Matches($html, '(?:src|href)="([^"]+)"') |
    ForEach-Object { ConvertTo-LocalPath $_.Groups[1].Value $HtmlFile } |
    Where-Object { $_ } |
    Sort-Object -Unique
}

$manifestPath = Join-Path $rootFull 'public-files.txt'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'public-files.txt is missing' }
$manifest = @(Get-Content -LiteralPath $manifestPath -Encoding UTF8 | Where-Object { $_.Trim() })
foreach ($path in $required) {
  if ($path -notin $manifest) { throw "Required public file is absent from manifest: $path" }
}
foreach ($path in $manifest) {
  $full = [IO.Path]::GetFullPath((Join-Path $rootFull $path))
  if (-not $full.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes root: $path" }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing public file: $path" }
}

$references = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$visitedHtml = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$pendingHtml = [Collections.Generic.Queue[string]]::new()
$pendingHtml.Enqueue('index.html')
while ($pendingHtml.Count) {
  $htmlFile = $pendingHtml.Dequeue()
  if (-not $visitedHtml.Add($htmlFile)) { continue }
  foreach ($reference in Get-DirectHtmlReferences $htmlFile) {
    [void]$references.Add($reference)
    if ([IO.Path]::GetExtension($reference) -ieq '.html') { $pendingHtml.Enqueue($reference) }
  }
}
foreach ($reference in $references) {
  if ($reference -notin $manifest) { throw "Recursive HTML reference is absent from manifest: $reference" }
}

if (Test-Path -LiteralPath (Join-Path $rootFull '.git')) {
  $tracked = @(git -c core.quotepath=false -C $rootFull ls-files)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Git-tracked public file set' }
  $manifestOnly = @($manifest | Where-Object { $_ -notin $tracked })
  $trackedOnly = @($tracked | Where-Object { $_ -notin $manifest })
  if ($manifestOnly.Count -or $trackedOnly.Count) {
    $differences = @()
    if ($manifestOnly.Count) { $differences += "Manifest files are not tracked: $($manifestOnly -join ', ')" }
    if ($trackedOnly.Count) { $differences += "Tracked files are absent from manifest: $($trackedOnly -join ', ')" }
    throw "Public file set mismatch: $($differences -join '; ')"
  }
}

$textFiles = $manifest | Where-Object { [IO.Path]::GetExtension($_) -in @('.html', '.md', '.mmd', '.json', '.yml', '.yaml', '.ps1', '.mjs', '') }
$secretPattern = '(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|SUPABASE_(?:ANON_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*[^\s]+)'
$absolutePathPattern = '(?:(?<![A-Za-z0-9])(?i:[A-Z]:[\\/])|\\\\[A-Za-z0-9._-]+[\\/][A-Za-z0-9._$ -]+|/(?:Users|home|mnt|workspace)(?:/|$))'
foreach ($path in $textFiles) {
  $value = Get-Content -LiteralPath (Join-Path $rootFull $path) -Raw -Encoding UTF8
  if ($value -match $secretPattern) { throw "Potential secret in public file: $path" }
  if ($value -cmatch $absolutePathPattern) { throw "Local absolute path in public file: $path" }
}

"PASS: $($manifest.Count) tracked public files; $($references.Count) recursive local HTML references; no path escape, missing file, unexpected tracked file, local absolute path, or secret pattern."
