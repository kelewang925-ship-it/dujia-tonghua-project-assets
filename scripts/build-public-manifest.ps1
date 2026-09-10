param([string]$Root = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'

$rootFull = [IO.Path]::GetFullPath($Root)
$rootPrefix = $rootFull + [IO.Path]::DirectorySeparatorChar

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
  $html = $html -replace '(?is)(<script\b[^>]*>).*?</script>', '$1</script>'
  [regex]::Matches($html, '(?:src|href)="([^"]+)"') |
    ForEach-Object { ConvertTo-LocalPath $_.Groups[1].Value $HtmlFile } |
    Where-Object { $_ } |
    Sort-Object -Unique
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

$tracked = @(git -c core.quotepath=false -C $rootFull ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Git-tracked public file set' }
foreach ($reference in $references) {
  if ($reference -notin $tracked) { throw "HTML reference is not tracked for publication: $reference" }
}

$manifest = @($tracked | Sort-Object -Unique)
[IO.File]::WriteAllLines((Join-Path $rootFull 'public-files.txt'), [string[]]$manifest, [Text.UTF8Encoding]::new($false))
"Generated public-files.txt with $($manifest.Count) tracked files and $($references.Count) recursive local HTML references."
