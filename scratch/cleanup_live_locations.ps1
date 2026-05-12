$path = 'd:\Caldim_Projects\CALTRACK\Caltrack\frontend\src\ui\pages\LiveLocationsPage.jsx'
$c = Get-Content $path
$endMatch = $c | Select-String -Pattern '>>>>>>> 17a742eb5a8defc6b5fe95580ed3cf26ba609ecd'

if ($endMatch) {
    $start = 761 # The current garbage start
    $end = $endMatch[0].LineNumber
    echo "Deleting from $start to $end"
    $new = $c[0..($start-1)] + $c[$end..($c.Length-1)]
    $new | Set-Content $path
    echo "Success"
} else {
    echo "End Marker not found."
}
