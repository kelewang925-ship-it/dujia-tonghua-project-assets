param([string]$Root = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$rootFull = [IO.Path]::GetFullPath($Root)
$html = Get-Content -LiteralPath (Join-Path $Root 'index.html') -Raw -Encoding UTF8
$refs = [regex]::Matches($html, '(?:src|href)="([^"]+)"') |
  ForEach-Object { [uri]::UnescapeDataString($_.Groups[1].Value) } |
  Where-Object { $_ -notmatch '^(?:https?:|#|mailto:|javascript:)' } |
  Sort-Object -Unique
foreach ($ref in $refs) {
  $full = [IO.Path]::GetFullPath((Join-Path $rootFull $ref))
  if (-not $full.StartsWith($rootFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes root: $ref" }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "Missing referenced file: $ref" }
}
$infrastructure = @('index.html', 'README.md', '.gitignore', '.nojekyll',
  '.github/workflows/pages.yml', 'scripts/build-public-manifest.ps1',
  'scripts/verify-public-site.ps1', 'scripts/test-showcase.mjs', 'public-files.txt')
@($infrastructure + $refs | Sort-Object -Unique) |
  Set-Content -LiteralPath (Join-Path $Root 'public-files.txt') -Encoding utf8NoBOM
"Generated public-files.txt with $((@($infrastructure + $refs | Sort-Object -Unique)).Count) files."
