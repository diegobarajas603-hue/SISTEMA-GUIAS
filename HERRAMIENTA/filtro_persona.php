<?php
$host = "localhost";
$user = "root";
$pass = "";
$db = "control_herramientas";

$conn = new mysqli($host, $user, $pass, $db);
$conn->set_charset('utf8mb4');

$id = intval($_GET['empleado_id']);
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Herramientas por Empleado</title>
<style>
body{font-family:Arial;background:#f4f6f9}
.container{width:90%;margin:auto}
.card{background:white;padding:20px;margin-top:20px;border-radius:10px}
table{width:100%;border-collapse:collapse}
td,th{padding:10px;border-bottom:1px solid #ddd}
.alerta{background:#ffcccc}
</style>
</head>
<body>

<div class="container">
<div class="card">

<h2>Herramientas del empleado</h2>

<table>
<tr>
<th>Herramienta</th>
<th>Fecha</th>
<th>Comentarios</th>
</tr>

<?php
$q="SELECT h.nombre, a.fecha_asignacion, a.comentarios
FROM asignaciones a
JOIN herramientas h ON a.herramienta_id=h.id_herramienta
WHERE a.empleado_id='$id' AND a.activa=1";

$r=$conn->query($q);

while($row=$r->fetch_assoc()){
 $dias=(time()-strtotime($row['fecha_asignacion']))/86400;
 $clase=$dias>3?'alerta':'';

 echo "<tr class='$clase'>
 <td>{$row['nombre']}</td>
 <td>{$row['fecha_asignacion']}</td>
 <td>{$row['comentarios']}</td>
 </tr>";
}
?>

</table>

<p>🔴 Más de 3 días sin devolver</p>

<br>
<a href="Herramienta.php">⬅ Volver</a>

</div>
</div>

</body>
</html>