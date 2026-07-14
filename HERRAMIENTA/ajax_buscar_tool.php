<?php
$conn=new mysqli("localhost","root","","control_herramientas");
$conn->set_charset('utf8mb4');

$q = $conn->real_escape_string($_GET['q'] ?? '');

$res = $conn->query("
SELECT h.nombre herramienta, e.nombre empleado, 'ASIGNADO' tipo
FROM asignaciones a
JOIN herramientas h ON a.herramienta_id=h.id_herramienta
JOIN empleados e ON a.empleado_id=e.id_empleado
WHERE a.activa=1 AND h.nombre LIKE '%$q%'
");

while($r=$res->fetch_assoc()){

 $color = $r['tipo'] == 'PRESTADO' ? '#f59e0b' : '#10b981';

 echo "
 <div style='
  background:white;
  padding:12px;
  margin-bottom:10px;
  border-radius:10px;
  box-shadow:0 2px 6px rgba(0,0,0,0.08);
 '>
   🔧 <b>".htmlspecialchars($r['herramienta'])."</b><br>
   👤 ".htmlspecialchars($r['empleado'])."<br>
   <span style='color:$color;font-weight:bold'>
    {$r['tipo']}
   </span>
 </div>
 ";
}
