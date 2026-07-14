<?php
date_default_timezone_set('America/Mexico_City');

// ob_start();
require_once __DIR__ . '/vendor/autoload.php';

$conn=new mysqli("localhost","root","","control_herramientas");
if($conn->connect_error) die("Error conexión");
$conn->set_charset('utf8mb4');

$vista=$_GET['vista']??'dashboard';

/* DASHBOARD */
$total_herramientas=$conn->query("SELECT COUNT(*) total FROM herramientas")->fetch_assoc()['total'];
$total_empleados=$conn->query("SELECT COUNT(*) total FROM empleados")->fetch_assoc()['total'];
$asignadas=$conn->query("SELECT COALESCE(SUM(cantidad),0) total FROM asignaciones WHERE activa=1")->fetch_assoc()['total'];

$sin_asignar=$conn->query("
SELECT COUNT(*) total FROM herramientas h
LEFT JOIN asignaciones a 
 ON h.id_herramienta=a.herramienta_id AND a.activa=1
WHERE a.id_asignacion IS NULL
")->fetch_assoc()['total'];


if(isset($_GET['toggle_empleado'])){

 $id = intval($_GET['toggle_empleado']);

 // cambiar estado
 $conn->query("
 UPDATE empleados 
 SET activo = IF(activo=1,0,1) 
 WHERE id_empleado='$id'
 ");

 header("Location:?vista=empleados");
 exit;
}

/* CREAR */
if(isset($_POST['crear_departamento'])){

 $nombre = $conn->real_escape_string(trim($_POST['nombre_departamento']));

 // validar duplicado
 $existe = $conn->query("SELECT * FROM departamentos WHERE nombre='$nombre'");

 if($existe->num_rows > 0){
 header("Location:?vista=crear&error=depto");
 exit;
}else{
 $conn->query("INSERT INTO departamentos(nombre) VALUES('$nombre')");
 header("Location:?vista=crear&ok=depto");
 exit;
}
}
if(isset($_POST['crear_empleado'])){

 $nombre = $conn->real_escape_string(trim($_POST['nombre_empleado']));
 $depto = intval($_POST['departamento']);

 // validar duplicado en mismo departamento
 $existe = $conn->query("
 SELECT * FROM empleados 
 WHERE nombre='$nombre' AND departamento_id='$depto'
 ");

 if($existe->num_rows > 0){
  header("Location:?vista=crear&error=empleado");
  exit;
 }else{
  $conn->query("INSERT INTO empleados(nombre,departamento_id) VALUES('$nombre','$depto')");
  header("Location:?vista=crear&ok=empleado");
  exit;
 }
}

if(isset($_POST['crear_categoria'])){

$nombre = $conn->real_escape_string(strtolower(trim($_POST['nombre_categoria'])));

 // validar duplicado
 $existe = $conn->query("SELECT * FROM categorias WHERE nombre='$nombre'");

if($existe->num_rows > 0){
 header("Location:?vista=crear&error=categoria");
 exit;
}else{
 $conn->query("INSERT INTO categorias(nombre) VALUES('$nombre')");
 header("Location:?vista=crear&ok=categoria");
 exit;
}
}

if(isset($_POST['crear_herramienta'])){

 $nombre = $conn->real_escape_string(trim($_POST['nombre_herramienta']));
 $categoria = intval($_POST['categoria']);

 $img = "";

 if(!empty($_FILES['imagen']['name'])){

  $ext = strtolower(pathinfo($_FILES['imagen']['name'], PATHINFO_EXTENSION));
  $permitidas = ['jpg','jpeg','png','gif','webp','avif','jfif'];

  if(in_array($ext, $permitidas)){
   $img = time()."_".preg_replace('/[^A-Za-z0-9._-]/','_', basename($_FILES['imagen']['name']));
   move_uploaded_file($_FILES['imagen']['tmp_name'], "uploads/".$img);
  }
 }

 $conn->query("INSERT INTO herramientas(nombre,imagen,categoria_id)
VALUES('$nombre','".$conn->real_escape_string($img)."','$categoria')");

 header("Location:?vista=crear&ok=herramienta");
 exit;
}

/* ASIGNAR */
if(isset($_POST['herramientas']) && !empty($_POST['empleado'])){
 $emp = intval($_POST['empleado']);

 // misma fecha/hora para todo el lote → permite identificar la "última asignación"
 $fecha_lote = date('Y-m-d H:i:s');

 foreach($_POST['herramientas'] as $h){
  $h = intval($h);
  $cant = max(1, intval($_POST['cantidad'][$h] ?? 1));

  $conn->query("INSERT INTO asignaciones(empleado_id,herramienta_id,fecha_asignacion,activa,cantidad)
  VALUES('$emp','$h','$fecha_lote',1,'$cant')");
 }
$catParam = preg_replace('/\D/','', $_GET['categoria'] ?? '');
header("Location:?vista=asignar&empleado=".$emp."&categoria=".$catParam);
exit;
}

/* RETIRAR */
if(isset($_GET['retirar'])){
 $id_ret = intval($_GET['retirar']);
 $conn->query("UPDATE asignaciones SET activa=0 WHERE id_asignacion='$id_ret'");
 header("Location:?vista=asignaciones");
 exit;
}

/* SALIDA ALMACEN */
if(isset($_POST['crear_salida'])){

 $folio = trim($_POST['folio']);
 $folio_sql = $conn->real_escape_string($folio);

$validar = $conn->query("
SELECT id_salida
FROM salidas_almacen
WHERE folio='$folio_sql'
");

if($validar->num_rows > 0){

 header("Location:?vista=salidas&error=folio");
 exit;
}

 $nombre = trim($_POST['nombre']);
 $proveedor = trim($_POST['proveedor']);
 $observaciones = trim($_POST['observaciones']);

 // versiones seguras para HTML del PDF
 $folio_html = htmlspecialchars($folio);
 $nombre_html = htmlspecialchars($nombre);
 $proveedor_html = htmlspecialchars($proveedor);
 $obs_html = nl2br(htmlspecialchars($observaciones));

 $hora = date('H:i');

 if(!is_dir("salidas_pdf")){
   mkdir("salidas_pdf");
 }

 // nombre de archivo seguro (solo letras, números, guiones)
 $nombre_pdf = preg_replace('/[^A-Za-z0-9_-]/','_',$folio).".pdf";

while (ob_get_level()) {
    ob_end_clean();
}

 $pdf = new TCPDF();

$pdf->SetTitle('Salida de Almacen');
$pdf->SetAuthor('FLETES TAURO');
$pdf->SetMargins(12,12,12);
$pdf->SetAutoPageBreak(TRUE,15);
$pdf->SetFillColor(245,247,250);

 $pdf->setPrintHeader(false);
 $pdf->SetMargins(12,12,12);
 $pdf->AddPage('P','LETTER');
 $pdf->SetFont('helvetica','',11);
 $pdf->Ln(8);

$html = '

<table width="100%" cellpadding="8">

<tr>

<td width="60%">

<img src="uploads/logo-tauro.jpg" width="180">

</td>

<td width="40%" align="right">

<span style="font-size:10px;color:#6b7280;">
GENERADO
</span>

<br>

<span style="font-size:14px;font-weight:bold;">
'.date("d/m/Y H:i").'
</span>

</td>

</tr>

</table>

<br><br>

<table width="100%" cellpadding="18" bgcolor="#1d4ed8">

<tr>

<td align="center">

<span style="color:white;font-size:11px;letter-spacing:3px;">
FOLIO
</span>

<br><br>

<span style="color:white;font-size:28px;font-weight:bold;">
'.$folio_html.'
</span>

</td>

</tr>

</table>

<br><br><br>

<table width="100%" cellpadding="10">

<tr>

<td colspan="2">

<span style="font-size:16px;font-weight:bold;color:#1d4ed8;">
INFORMACIÓN GENERAL
</span>

</td>

</tr>

<tr>

<td width="48%">

<table width="100%" cellpadding="14" border="1">

<tr>
<td>

<span style="font-size:10px;color:#6b7280;">
NOMBRE
</span>

<br><br>

<span style="font-size:14px;font-weight:bold;">
'.$nombre_html.'
</span>

</td>
</tr>

</table>

</td>

<td width="4%"></td>

<td width="48%">

<table width="100%" cellpadding="14" border="1">

<tr>
<td>

<span style="font-size:10px;color:#6b7280;">
PROVEEDOR
</span>

<br><br>

<span style="font-size:14px;font-weight:bold;">
'.$proveedor_html.'
</span>

</td>
</tr>

</table>

</td>

</tr>

</table>

<br><br><br>

<span style="font-size:16px;font-weight:bold;color:#1d4ed8;">
OBSERVACIONES
</span>

<br><br>

<table width="100%" cellpadding="20" border="1">

<tr>

<td height="120">

<span style="font-size:13px;line-height:28px;">
'.$obs_html.'
</span>

</td>

</tr>

</table>

<br><br><br><br><br><br>

<table width="100%">

<tr>

<td align="center">

__________________________________

<br><br>

<span style="font-size:12px;color:#6b7280;">
Firma y autorización
</span>

</td>

</tr>

</table>

';

 $pdf->writeHTML($html,true,false,true,false,'');

$ruta = __DIR__ . "/salidas_pdf/" . $nombre_pdf;

$pdf_content = $pdf->Output('', 'S');

file_put_contents($ruta, $pdf_content);

 $conn->query("
 INSERT INTO salidas_almacen(
  folio,
  nombre,
  proveedor,
  observaciones,
  fecha,
  hora,
  pdf
 )
 VALUES(
 '$folio_sql',
 '".$conn->real_escape_string($nombre)."',
 '".$conn->real_escape_string($proveedor)."',
 '".$conn->real_escape_string($observaciones)."',
 CURDATE(),
 '$hora',
 '".$conn->real_escape_string($nombre_pdf)."'
 )
 ");

 header("Location:?vista=salidas&ok=1");
 exit;
}

/* ELIMINAR SALIDA */
if(isset($_GET['eliminar_salida'])){

 $id = intval($_GET['eliminar_salida']);

 // obtener pdf
 $q = $conn->query("
 SELECT pdf
 FROM salidas_almacen
 WHERE id_salida='$id'
 ");

 if($q->num_rows > 0){

   $row = $q->fetch_assoc();

   $ruta = __DIR__ . "/salidas_pdf/" . basename($row['pdf']);

   // eliminar archivo físico
   if(file_exists($ruta)){
      unlink($ruta);
   }

   // eliminar registro BD
   $conn->query("
   DELETE FROM salidas_almacen
   WHERE id_salida='$id'
   ");

 }

 header("Location:?vista=salidas");
 exit;
}

/* PDF RESPONSIVA */
if(isset($_GET['pdf_empleado'])){

 $id = intval($_GET['pdf_empleado']);

 // alcance: 'todas' = todas las herramientas activas | 'ultimas' = solo el último lote asignado
 $alcance = $_GET['alcance'] ?? 'todas';

 $emp = $conn->query("
 SELECT e.nombre,d.nombre departamento
 FROM empleados e
 LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
 WHERE e.id_empleado='$id'
 ")->fetch_assoc();

 $filtro_lote = "";
 $subtitulo = "";

 if($alcance == 'ultimas'){

  $ult = $conn->query("
  SELECT MAX(fecha_asignacion) f
  FROM asignaciones
  WHERE empleado_id='$id' AND activa=1
  ")->fetch_assoc();

  if(!empty($ult['f'])){
   $f = $conn->real_escape_string($ult['f']);
   $filtro_lote = " AND a.fecha_asignacion='$f' ";
   $subtitulo = "Última asignación: ".date("d/m/Y H:i", strtotime($ult['f']));
  }
 }

 $herr = $conn->query("
 SELECT h.nombre, SUM(COALESCE(a.cantidad,1)) cantidad
 FROM asignaciones a
 JOIN herramientas h ON a.herramienta_id=h.id_herramienta
 WHERE a.empleado_id='$id' AND a.activa=1 $filtro_lote
 GROUP BY h.id_herramienta, h.nombre
 ORDER BY h.nombre
 ");

 if(!$emp){
  die("Empleado no encontrado");
 }

 while (ob_get_level()) {
     ob_end_clean();
 }

 $pdf = new TCPDF();
 $pdf->setPrintHeader(false);
 $pdf->SetMargins(20,15,20);
 $pdf->SetAutoPageBreak(TRUE,25);
 $pdf->setCellPadding(3);
 $pdf->SetFont('helvetica','',10);
 $pdf->AddPage('P');
 $pdf->Image('uploads/logo-tauro.jpg', 15, 5, 65);
 $pdf->Ln(5);

 // línea más abajo (mejor estética)
 $pdf->SetLineWidth(0.8);
 $pdf->Line(15, 18, 195, 18);
 $pdf->SetY(25);
$html = "

<style>
body{font-family:helvetica;font-size:11px;color:#000;}

.texto{
 text-align:justify;
 font-size:15px;
 margin-bottom:15px;
}

.bold{font-weight:bold;}

.firma{
 margin-top:80px;
 text-align:center;
}

.tools td{
 padding:3px;
}
</style>

<div style='text-align:center; font-size:26px; font-weight:bold; margin-bottom:15px;'>
RESPONSIVA HERRAMIENTAS
</div>
".($subtitulo != "" ? "<div style='text-align:center;font-size:13px;color:#555;margin-bottom:12px;'>".htmlspecialchars($subtitulo)."</div>" : "")."

<!-- 🔥 NOMBRE Y DEPARTAMENTO ARRIBA -->
<table width='100%' style='margin-bottom:15px;'>
<tr>
<td width='50%'>
<span class='bold'>Nombre:</span><br>
".htmlspecialchars($emp['nombre'] ?? '')."
</td>

<td width='50%'>
<span class='bold'>Departamento:</span><br>
".htmlspecialchars($emp['departamento'] ?? '')."
</td>
</tr>
</table>
<br><br><br>
<!-- 🔥 TEXTO DESPUÉS -->
<div class='texto'>
Por medio del presente, se hace constar que el colaborador reconoce haber recibido de FLETES TAURO S.A. DE C.V. las herramientas asignadas para el cumplimiento de sus funciones laborales.<br><br>

El colaborador se compromete a hacer un uso adecuado, responsable y exclusivamente laboral de dichas herramientas, así como a conservarlas en buen estado, evitando cualquier deterioro derivado de un manejo inadecuado, negligente o distinto a su finalidad.<br><br>

De igual forma, se compromete a realizar la devolución de las herramientas en las condiciones en que fueron entregadas, considerando el desgaste natural por uso, cuando le sean requeridas o al término de la relación laboral.
</div>

<br>

<div class='bold'>HERRAMIENTAS</div>
<br>

<table width='100%' class='tools'>
<tr>
<td width='50%' valign='top'>
";

$tools = [];
while($h = $herr->fetch_assoc()){
    $etq = $h['nombre'];
    if($h['cantidad'] > 1){
     $etq .= " (x".intval($h['cantidad']).")";
    }
    $tools[] = $etq;
}

$total = count($tools);
$mitad = ceil($total / 2);

$col1 = array_slice($tools, 0, $mitad);
$col2 = array_slice($tools, $mitad);

$html .= "<ul>";
foreach($col1 as $t){
    $html .= "<li>".htmlspecialchars($t)."</li>";
}
$html .= "</ul>";

$html .= "</td><td width='50%' valign='top'><ul>";

foreach($col2 as $t){
    $html .= "<li>".htmlspecialchars($t)."</li>";
}
$html .= "</ul>";

$html .= "
</td>
</tr>
</table>
";


$pdf->writeHTML($html,true,false,true,false,'');

// 🔥 POSICIONAR SIEMPRE ABAJO
$pdf->SetY(-49); // distancia desde abajo

$pdf->Cell(0,10,'_____________________________________',0,1,'C');
$pdf->Cell(0,5,'Firma del empleado',0,1,'C');

$pdf->Output('responsiva.pdf','I');
exit;
}
?>


<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Sistema PRO</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
body{margin:0;font-family:Segoe UI;background:#eef2f7}
.container{display:flex}


/* SIDEBAR */
.menu{
width:240px;
background:#111827;
color:white;
height:100vh;
padding:20px;
}
.menu h2{color:white}
.menu a{
display:block;
padding:12px;
margin:8px 0;
color:#cbd5e1;
text-decoration:none;
border-radius:8px;
}
.menu a:hover{background:#1f2937;color:white}

/* CONTENT */
.content{flex:1;padding:25px}

/* CARDS */
.card{
background:white;
padding:20px;
border-radius:16px;
margin-bottom:20px;
box-shadow:0 8px 20px rgba(0,0,0,0.08);
}

.grid-herramientas{
 display:grid;
 grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
 gap:20px;
 margin-top:15px;
}

.card-tool{
 background:white;
 border-radius:16px;
 padding:12px;
 text-align:center;
 box-shadow:0 4px 10px rgba(0,0,0,0.08);
 transition:.2s;
 cursor:pointer;
}

.card-tool:active{
 transform:scale(0.95);
}

.card-tool:hover{
 transform:scale(1.08);
 box-shadow:0 12px 25px rgba(0,0,0,0.2);
}

.card-tool img{
 width:50px;
 height:50px;
 object-fit:contain;
 margin-bottom:5px;
}

.card-tool div{
 font-size:13px;
 font-weight:500;
}

.empleado-card{
 background:white;
 border-radius:12px;
 padding:15px;
 margin-bottom:15px;
 box-shadow:0 4px 10px rgba(0,0,0,0.08);
 cursor:pointer;
 transition:.2s;
}

.empleado-card:hover{
 transform:scale(1.02);
}

.empleado-header{
 display:flex;
 justify-content:space-between;
 align-items:center;
 font-weight:bold;
}

.herramientas-list{
 display:none;
 margin-top:10px;
 padding-top:10px;
 border-top:1px solid #eee;
}

.herramienta-item{
 display:flex;
 align-items:center;
 gap:10px;
 margin:5px 0;
}

.form-grid{
 display:grid;
 grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
 gap:25px;
}

.form-card{
 background:white;
 padding:20px;
 border-radius:16px;
 box-shadow:0 8px 20px rgba(0,0,0,0.06);
 border:1px solid #eef2f7;
 display:flex;
 flex-direction:column;
 gap:10px;
}

.form-card label{
 font-size:13px;
 color:#374151;
}

.card{
 background:white;
 padding:25px;
 border-radius:18px;
 box-shadow:0 10px 25px rgba(0,0,0,0.08);
}

.form-card h3{
 margin:0 0 10px 0;
 font-size:16px;
 color:#111827;
 display:flex;
 align-items:center;
 gap:6px;
}

input, select{
 width:100%;
 padding:12px;
 border-radius:10px;
 border:1px solid #e5e7eb;
 background:#f9fafb;
 transition:.2s;
}

input:focus, select:focus{
 background:white;
 border-color:#3b82f6;
 box-shadow:0 0 0 2px rgba(59,130,246,0.15);
}

.form-card button{
 margin-top:10px;
 background:#3b82f6;
 border:none;
 padding:12px;
 border-radius:10px;
 font-weight:500;
}

button{
 width:100%;
 background:#3b82f6;
 color:white;
 border:none;
 padding:12px;
 border-radius:10px;
 cursor:pointer;
 transition:.2s;
}

button:hover{
 background:#2563eb;
}

/* ASIGNAR PRO */
.asignar-top{
 display:grid;
 grid-template-columns:1fr 1fr;
 gap:15px;
 margin-bottom:20px;
}

.asignar-box{
 background:#f9fafb;
 padding:15px;
 border-radius:12px;
 box-shadow:0 2px 6px rgba(0,0,0,0.05);
}

.tools-grid{
 display:grid;
  grid-template-columns:repeat(auto-fill,minmax(120px,1fr));
 gap:15px;
 margin-top:15px;
}

.tool-card{
 background:white;
 border-radius:12px;
 padding:10px;
 text-align:center;
 cursor:pointer;
 border:2px solid transparent;
 transition:.2s;
 display:flex;
 flex-direction:column;
 align-items:center;
 justify-content:center;
 height:140px;
}

.tool-card:hover{
 transform:scale(1.05);
}

.tool-card.selected{
 border-color:#3b82f6;
 background:#eff6ff;
}

.tool-card img{
 width:60px;
 height:60px;
 object-fit:contain;
 margin-bottom:5px;
}

.tool-card div{
 font-size:13px;
 font-weight:600;
}

.tool-card small{
 font-size:11px;
 color:#6b7280;
}

.btn-asignar{
 margin-top:20px;
 width:100%;
 background:#10b981;
 padding:12px;
 border:none;
 border-radius:10px;
 color:white;
 font-weight:bold;
 transition:.2s;
}

.btn-asignar:hover{
 background:#059669;
}

/* GRID */
.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
gap:20px;
}

.grid-herramientas{
 display:grid;
 grid-template-columns:repeat(auto-fill,minmax(110px,1fr));
 gap:12px;
}

.kpi{
padding:20px;
border-radius:14px;
color:white;
text-align:center;
}
.azul{background:#3b82f6}
.verde{background:#10b981}
.naranja{background:#f59e0b}
.rojo{background:#ef4444}

/* FORM */
input,select{
width:100%;
padding:10px;
margin:6px 0;
border-radius:8px;
border:1px solid #d1d5db;
}
button{
background:#3b82f6;
color:white;
border:none;
padding:10px;
border-radius:8px;
cursor:pointer;
}

/* TABLE */
table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid #ddd}

.depto-title{
 background: linear-gradient(135deg,#1e293b,#0f172a); /* más oscuro */
 color: #ffffff; /* 🔥 BLANCO REAL */
 padding: 16px 18px;
 border-radius: 14px;
 margin-top: 20px;
 font-weight: 700;
 font-size: 17px; /* 🔥 MÁS GRANDE */
 letter-spacing: .5px;
 box-shadow: 0 6px 15px rgba(0,0,0,0.35);
 cursor: pointer;
 display:flex;
 align-items:center;
 justify-content:space-between;
}
/* hover más marcado */
.depto-title:hover{
 background: linear-gradient(135deg,#1d4ed8,#4338ca);
 transform: translateY(-2px);
 box-shadow: 0 12px 22px rgba(30,64,175,0.45);
}
.depto-title span,
.depto-title{
 color: #ffffff !important;
}

.empleados-grid{
 display:grid;
 grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
 gap:15px;
 margin-top:10px;
}

.empleado-item{
 background:white;
 border-radius:12px;
 padding:15px;
 box-shadow:0 4px 10px rgba(0,0,0,0.08);
 display:flex;
 flex-direction:column;
 gap:5px;
 cursor:pointer;
 transition:.2s;
}

.empleado-item:hover{
 transform:scale(1.03);
box-shadow:0 8px 20px rgba(0,0,0,0.15);
}

.empleado-nombre{
 font-weight:bold;
}

.empleado-acciones{
 margin-top:8px;
 display:flex;
 justify-content:space-between;
}	

.buscador-bar{
 display:flex;
 align-items:center;
 gap:10px;
 background:#f9fafb;
 padding:10px;
 border-radius:12px;
 box-shadow:0 2px 6px rgba(0,0,0,0.05);
 margin-bottom:15px;
}

.buscador-input{
 flex:1;
 border:none;
 outline:none;
 padding:10px;
 border-radius:8px;
 background:white;
}

.buscador-input:focus{
 box-shadow:0 0 0 2px rgba(59,130,246,0.2);
}

.btn-clear{
 background:#ef4444;
 color:white;
 border:none;
 padding:8px 12px;
 border-radius:8px;
 cursor:pointer;
 transition:.2s;
}

.btn-clear:hover{
 background:#dc2626;
}

.resultados{
 font-size:12px;
 color:#6b7280;
 white-space:nowrap;
}

.btn-clear{
 width:auto !important;
 flex-shrink:0;
 padding:8px 12px;
}

.buscador-input{
 flex:1;
 width:auto !important;
}

.resultados{
 min-width:100px;
 text-align:right;
}

.detalle-header{
 display:flex;
 align-items:center;
 gap:15px;
 margin-bottom:20px;
}

.btn-volver{
 background:#e0e7ff;
 color:#3730a3;
 padding:8px 14px;
 border-radius:10px;
 text-decoration:none;
 font-weight:500;
 transition:.2s;
}

.btn-volver:hover{
 background:#c7d2fe;
 transform:translateX(-3px);
}

.detalle-depto{
 color:#6b7280;
 font-size:13px;
}

.app-header{
 position:sticky;
 top:0;
 background:white;
 padding:15px;
 display:flex;
 align-items:center;
 gap:10px;
 box-shadow:0 4px 10px rgba(0,0,0,0.08);
 z-index:10;
 border-bottom:1px solid #eee;
}

.btn-back{
 font-size:18px;
 text-decoration:none;
 color:#111;
 background:#f1f5f9;
 padding:8px 10px;
 border-radius:10px;
}

.app-title{
 font-weight:600;
 font-size:16px;
}

.app-sub{
 font-size:12px;
 color:#6b7280;
}

.app-search{
 padding:10px;
 position:sticky;
 top:70px;
 background:#eef2f7;
 z-index:9;
}

.app-search input{
 width:100%;
 padding:12px;
 border-radius:12px;
 border:none;
 outline:none;
 box-shadow:0 2px 6px rgba(0,0,0,0.08);
}

.depto-title span{
 padding-left:5px;
}
.depto-title span:first-child{
 font-size: 17px;
 font-weight: 700;
}

body.app-mode .menu{
 display:none;
}

body.app-mode .content{
 padding:0;
 width:100%;
}
.flecha{
 transition:.2s;
 font-size:14px;
}
.tool-card.selected{
 border-color:#10b981;
 background:#ecfdf5;
 box-shadow:0 0 0 2px rgba(16,185,129,0.4);
 transform:scale(1.05);
}

.modal{
 display:none;
 position:fixed;
 top:0;
 left:0;
 width:100%;
 height:100%;
 background:rgba(0,0,0,0.7);
 justify-content:center;
 align-items:center;
 z-index:999;
}

.modal-content{
 background:white;
 padding:20px;
 border-radius:16px;
 text-align:center;
 max-width:350px;
 width:90%;
 animation:zoom .2s ease;
}

.modal-content img{
 width:100%;
 max-height:250px;
 object-fit:contain;
 margin-bottom:10px;
}

#modalNombre{
 font-weight:bold;
 font-size:16px;
}

.close{
 position:absolute;
 top:15px;
 right:20px;
 font-size:18px;
 cursor:pointer;
}

@keyframes zoom{
 from{transform:scale(.8);opacity:0;}
 to{transform:scale(1);opacity:1;}
}
.btn-pdf{
 display:inline-flex;
 align-items:center;
 gap:6px;
 background:#eef2ff;
 color:#4338ca;
 padding:6px 10px;
 border-radius:8px;
 font-size:12px;
 font-weight:600;
 text-decoration:none;
 transition:.2s;
 box-shadow:0 2px 5px rgba(0,0,0,0.08);
}

.btn-pdf:hover{
 background:#4338ca;
 color:white;
 transform:translateY(-2px);
 box-shadow:0 6px 12px rgba(67,56,202,0.3);
}

.btn-estado{
 font-size:11px;
 padding:4px 8px;
 border-radius:8px;
 text-decoration:none;
 background:#f1f5f9;
 color:#111;
 transition:.2s;
}

.btn-estado:hover{
 background:#e2e8f0;
}

.empleado-item.inactivo{
 opacity:0.5;
 filter:grayscale(1);
}
.empleado-item.inactivo:hover{
 transform:none;
 box-shadow:0 4px 10px rgba(0,0,0,0.08);
}

/* 📱 RESPONSIVE PRO */

@media (max-width: 1024px){

 .menu{
  width:200px;
 }

 .content{
  padding:15px;
 }

}

/* 📱 TABLET */
@media (max-width: 768px){

 .container{
  flex-direction:column;
 }

 .menu{
  width:100%;
  height:auto;
  display:flex;
  overflow-x:auto;
  gap:10px;
 }

 .menu a{
  flex:1;
  text-align:center;
  font-size:13px;
  padding:10px;
 }

 .content{
  padding:10px;
 }

 .grid{
  grid-template-columns:1fr 1fr;
 }

 .empleados-grid{
  grid-template-columns:1fr;
 }

 .tools-grid{
  grid-template-columns:repeat(2,1fr);
 }

}

/* 📱 CELULAR */
@media (max-width: 480px){

 .menu{
  display:none; /* 🔥 estilo app */
 }

 body{
  padding-bottom:60px;
 }

 .grid{
  grid-template-columns:1fr;
 }

 .tools-grid{
  grid-template-columns:1fr 1fr;
 }

 .tool-card{
  height:120px;
 }

 .card{
  padding:15px;
  border-radius:12px;
 }

 .depto-title{
  font-size:14px;
  padding:12px;
 }

}

.bottom-nav{
 display:none;
 position:fixed;
 bottom:0;
 left:0;
 width:100%;
 background:#111827;
 padding:10px;
 justify-content:space-around;
 z-index:100;
}

.bottom-nav a{
 color:white;
 text-decoration:none;
 font-size:18px;
}

@media (max-width:480px){
 .bottom-nav{
  display:flex;
 }
}

.modal{
 display:none;
 position:fixed;
 top:0;
 left:0;
 width:100%;
 height:100%;
 background:rgba(0,0,0,0.7);
 justify-content:center;
 align-items:center;
 z-index:9999; /* 🔥 sube prioridad */
}

/* CANTIDAD EN ASIGNAR */
.tool-card{
 height:auto;
 min-height:140px;
}

.cant-box{
 display:none;
 margin-top:6px;
 align-items:center;
 gap:4px;
 font-size:11px;
 color:#374151;
}

.tool-card.selected .cant-box{
 display:flex;
}

.cant-input{
 width:60px !important;
 padding:4px 6px !important;
 margin:0 !important;
 border-radius:6px;
 border:1px solid #d1d5db;
 text-align:center;
 background:white;
}

.empleado-acciones{
 flex-wrap:wrap;
 gap:6px;
}
</style>
</head>
<body class="<?php echo ($vista=='empleado_detalle') ? 'app-mode' : ''; ?>">

<div class="container">

<div class="menu">
<h2>⚙ Sistema</h2>
<a href="?vista=dashboard">Dashboard</a>
<a href="?vista=crear">Crear</a>
<a href="?vista=asignar">Asignar</a>
<a href="?vista=empleados">Empleados</a>
<a href="?vista=asignaciones">Asignaciones</a>
<a href="?vista=salidas">📦 Salida Almacén</a>
<a href="?vista=pdf_salidas">📄 PDFs Salidas</a>
</div>

<div class="content">

<!-- DASHBOARD -->
<?php if($vista=='dashboard'): ?>
<div class="grid">
<div class="kpi azul">Herramientas<h1><?=$total_herramientas?></h1></div>
<div class="kpi verde">Empleados<h1><?=$total_empleados?></h1></div>
<div class="kpi naranja">Asignadas<h1><?=$asignadas?></h1></div>
<div class="kpi rojo">Disponibles<h1><?=$sin_asignar?></h1></div>
</div>
<?php endif; ?>

<?php if($vista=='empleado_detalle'): ?>

<?php
$id = intval($_GET['id']);

// info empleado
$emp=$conn->query("
SELECT e.nombre, d.nombre departamento
FROM empleados e
LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
WHERE e.id_empleado='$id'
")->fetch_assoc();

?>

<div class="app-header">
  <a href="?vista=empleados" class="btn-back">⬅</a>

  <div>
    <div class="app-title"><?= $emp['nombre'] ?></div>
    <div class="app-sub"><?= $emp['departamento'] ?></div>
  </div>
</div>

<div class="app-search">
  <input type="text" id="buscarHerramienta" placeholder="Buscar herramienta...">
</div>

<div style="padding:10px">


<br>

<?php
// herramientas agrupadas por categoria
$q=$conn->query("
SELECT h.nombre, h.imagen, c.nombre categoria, SUM(COALESCE(a.cantidad,1)) cantidad
FROM asignaciones a
JOIN herramientas h ON a.herramienta_id=h.id_herramienta
LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
WHERE a.empleado_id='$id' AND a.activa=1
GROUP BY h.id_herramienta, h.nombre, h.imagen, c.nombre
ORDER BY c.nombre, h.nombre
");



$cat_actual = "";

while($r=$q->fetch_assoc()){

 if($cat_actual != $r['categoria']){

  if($cat_actual != ""){
   echo "</div>";
  }

  $cat_actual = trim($r['categoria'] ?? '');
$idCat = preg_replace('/[^a-zA-Z0-9]/','', $cat_actual);

  echo "<div class='depto-title' onclick='toggleCategoria(\"cat{$idCat}\")'>
<span>🏷 {$cat_actual}</span>
<span class='flecha'>▸</span>
</div>";

echo "<div class='grid-herramientas categoria' id='cat{$idCat}' style='display:none'>";
 }

$imgAttr = htmlspecialchars($r['imagen'] ?? '', ENT_QUOTES);
$nomAttr = htmlspecialchars($r['nombre'] ?? '', ENT_QUOTES);
$nomJS = htmlspecialchars(addslashes($r['nombre'] ?? ''), ENT_QUOTES);

echo "
<div class='card-tool tool-item'
data-nombre='".htmlspecialchars(strtolower($r['nombre'] ?? ''), ENT_QUOTES)."'
onclick=\"abrirModal('uploads/{$imgAttr}','{$nomJS}')\">
   <img src='uploads/{$imgAttr}'>
   <div>{$nomAttr}".($r['cantidad'] > 1 ? " <b style='color:#3b82f6'>x".intval($r['cantidad'])."</b>" : "")."</div>

</div>
";
}

if($cat_actual != ""){
 echo "</div>";
}
?>

</div>

<?php endif; ?>

<!-- CREAR -->
<?php if($vista=='crear'): ?>
<div class="card">

<?php if(isset($_GET['error'])): ?>
<div style="background:#fee2e2;color:#991b1b;padding:10px;border-radius:8px;margin-bottom:10px;">
 ❌ Ya existe ese <?= $_GET['error'] ?>
</div>
<?php endif; ?>

<?php if(isset($_GET['error']) && $_GET['error']=='folio'): ?>

<div style="
background:#fee2e2;
color:#991b1b;
padding:12px;
border-radius:10px;
margin-bottom:15px;
font-weight:600;
">
❌ Ese folio ya existe
</div>

<?php endif; ?>

<?php if(isset($_GET['ok'])): ?>
<div style="background:#dcfce7;color:#166534;padding:10px;border-radius:8px;margin-bottom:10px;">
 ✅ <?= $_GET['ok'] ?> creado correctamente
</div>
<?php endif; ?>

<?php if(isset($_GET['error']) || isset($_GET['ok'])): ?>
<script>
 setTimeout(()=>{
  window.location.href = "?vista=crear";
 }, 2000);
</script>
<?php endif; ?>

<div class="form-grid">

<!-- DEPARTAMENTO -->
<div class="form-card">
<h3>📁 Departamento</h3>
<form method="POST">
<input name="nombre_departamento" placeholder="Ej: Producción">
<button name="crear_departamento">Guardar</button>
</form>
</div>

<!-- EMPLEADO -->
<div class="form-card">
<h3>👤 Empleado</h3>
<form method="POST">
<input name="nombre_empleado" placeholder="Nombre completo">

<select name="departamento" required>
<option value="" disabled selected>-- Selecciona departamento --</option>
<?php
$d=$conn->query("SELECT * FROM departamentos");
while($r=$d->fetch_assoc()){
 echo "<option value='{$r['id_departamento']}'>{$r['nombre']}</option>";
}
?>
</select>

<button name="crear_empleado">Guardar</button>
</form>
</div>

<!-- CATEGORÍA -->
<div class="form-card">
<h3>🏷 Categoría</h3>
<form method="POST">
<input name="nombre_categoria" placeholder="Ej: Eléctrica, Manual">
<button name="crear_categoria">Guardar</button>
</form>
</div>

<!-- HERRAMIENTA -->
<div class="form-card">
<h3>🔧 Herramienta</h3>
<form method="POST" enctype="multipart/form-data">
<input name="nombre_herramienta" placeholder="Nombre herramienta">

<select name="categoria" required>
<option value="" disabled selected>-- Selecciona categoría --</option>
<?php
$c=$conn->query("SELECT * FROM categorias");
while($r=$c->fetch_assoc()){
 echo "<option value='{$r['id_categoria']}'>{$r['nombre']}</option>";
}
?>
</select>

<input type="file" name="imagen">

<button name="crear_herramienta">Guardar</button>
</form>
</div>

</div>
</div>
<?php endif; ?>

<!-- EMPLEADOS -->
<?php if($vista=='empleados'): ?>
<div class="card">
<h2>👤 Empleados</h2>

<div class="buscador-bar">

<input type="text" id="buscarEmpleado" class="buscador-input" placeholder="🔍 Buscar empleado...">

<button id="limpiarBusqueda" class="btn-clear">✕</button>

<span id="contadorResultados" class="resultados"></span>

</div>

<div id="noResultados" style="display:none;color:#888;margin-bottom:10px;">
No se encontraron empleados
</div>


<?php

$q=$conn->query("
SELECT 
 e.*, 
 d.nombre departamento,
 COUNT(a.id_asignacion) AS total_herramientas
FROM empleados e
LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
LEFT JOIN asignaciones a 
 ON e.id_empleado = a.empleado_id AND a.activa=1
GROUP BY e.id_empleado
ORDER BY d.nombre, e.activo DESC, e.nombre
");

$dep_actual = "";

while($r=$q->fetch_assoc()){

 if($dep_actual != $r['departamento']){
  
  if($dep_actual != ""){
   echo "</div>"; // cerrar grid anterior
  }

 $dep_actual = trim($r['departamento'] ?? '');
$idDep = preg_replace('/[^a-zA-Z0-9]/','', $dep_actual);

echo "<div class='depto-title' onclick='toggleDepto(\"dep{$idDep}\")'>
📁 {$dep_actual}
</div>";

echo "<div class='empleados-grid' id='dep{$idDep}' style='display:none'>";
 }
/* 🔥 AQUÍ VA (ESTE ES EL PUNTO) */


?>

<div class="empleado-item <?= $r['activo'] ? '' : 'inactivo' ?>"
<?= $r['activo'] ? "onclick=\"window.location.href='?vista=empleado_detalle&id={$r['id_empleado']}'\"" : "" ?>
data-nombre="<?= htmlspecialchars(strtolower($r['nombre']." ".($r['departamento'] ?? '')), ENT_QUOTES) ?>">

  <div class="empleado-nombre" data-original="<?= htmlspecialchars($r['nombre'], ENT_QUOTES) ?>">
    👤 <?= $r['nombre'] ?>
  </div>

  <div style="color:#6b7280;font-size:12px">
    <?= $r['departamento'] ?>
  </div>

  <div class="empleado-acciones">
     <?php
$estado = $r['activo'] ?? 1;
?>

<a href="?toggle_empleado=<?= $r['id_empleado'] ?>"
onclick="event.stopPropagation()"
class="btn-estado">

<?= $estado ? '🟢 Activo' : '🚫 Inactivo' ?>
</a>

   <a href="?pdf_empleado=<?= $r['id_empleado'] ?>&alcance=todas"
   class="btn-pdf"
   target="_blank"
   onclick="event.stopPropagation()"
   title="Responsiva con todas las herramientas asignadas">
 <span>📑</span> Todas
</a>

   <a href="?pdf_empleado=<?= $r['id_empleado'] ?>&alcance=ultimas"
   class="btn-pdf"
   target="_blank"
   onclick="event.stopPropagation()"
   title="Responsiva solo de la última asignación">
 <span>🆕</span> Últimas
</a>
  </div>

  <div class="herramientas-list" id="emp<?= $r['id_empleado'] ?>">

<?php
  

$herr=$conn->query("
SELECT h.nombre, h.imagen, c.nombre categoria, SUM(COALESCE(a.cantidad,1)) cantidad
FROM asignaciones a
JOIN herramientas h ON a.herramienta_id=h.id_herramienta
LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
WHERE a.empleado_id='{$r['id_empleado']}' AND a.activa=1
GROUP BY h.id_herramienta, h.nombre, h.imagen, c.nombre
");

while($h=$herr->fetch_assoc()){
 $cant_txt = $h['cantidad'] > 1 ? " <span style='color:#3b82f6;font-weight:bold'>x".intval($h['cantidad'])."</span>" : "";
 echo "<div class='herramienta-item'>
   <img src='uploads/{$h['imagen']}' width='35'>
   <div>
     <b>{$h['nombre']}</b>{$cant_txt}<br>
     <small>{$h['categoria']}</small>
   </div>
 </div>";
}

echo "</div></div>";
}

if($dep_actual != ""){
 echo "</div>";
}

?>

</div>
<?php endif; ?>

<!-- ASIGNACIONES -->
<?php if($vista=='asignaciones'): ?>
<div class="card">
<h2>Asignaciones</h2>

<?php

$empleados=$conn->query("
SELECT 
 e.id_empleado, 
 e.nombre, 
 d.nombre AS departamento,
 COALESCE(SUM(a.cantidad),0) total
FROM empleados e
LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
LEFT JOIN asignaciones a
 ON e.id_empleado=a.empleado_id AND a.activa=1
GROUP BY e.id_empleado
HAVING total > 0
ORDER BY d.nombre, e.nombre
");

$dep_actual = "";

while($emp=$empleados->fetch_assoc()){

 if($dep_actual != $emp['departamento']){

  if($dep_actual != ""){
   echo "</div>"; // cerrar anterior
  }

  $dep_actual = trim($emp['departamento'] ?? '');
  $idDep = preg_replace('/[^a-zA-Z0-9]/','', $dep_actual);

  echo "<div class='depto-title' onclick='toggleDepto(\"asig{$idDep}\")'>
  📁 {$dep_actual}
  </div>";

  echo "<div id='asig{$idDep}' style='display:none'>";
 }

 echo "<div class='empleado-card' onclick='toggle({$emp['id_empleado']})'>
 
 <div class='empleado-header'>
   <span>👤 {$emp['nombre']}</span>
   <span>{$emp['total']} herramientas</span>
 </div>

 <div class='herramientas-list' id='emp{$emp['id_empleado']}'>";

 $herr=$conn->query("
 SELECT h.nombre, h.imagen, c.nombre categoria, a.id_asignacion, a.cantidad, a.fecha_asignacion
 FROM asignaciones a
 JOIN herramientas h ON a.herramienta_id=h.id_herramienta
 LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
 WHERE a.empleado_id='{$emp['id_empleado']}' AND a.activa=1
 ORDER BY a.fecha_asignacion DESC
 ");

 while($h=$herr->fetch_assoc()){
  $cant_txt = $h['cantidad'] > 1 ? " <span style='color:#3b82f6;font-weight:bold'>x".intval($h['cantidad'])."</span>" : "";
  $fecha_txt = $h['fecha_asignacion'] ? date("d/m/Y", strtotime($h['fecha_asignacion'])) : "";
  echo "<div class='herramienta-item'>
   <img src='uploads/{$h['imagen']}' width='40'>
   <div>
     <b>{$h['nombre']}</b>{$cant_txt}<br>
     <small>{$h['categoria']} · $fecha_txt</small>
   </div>
   <a href='?retirar={$h['id_asignacion']}' style='margin-left:auto;color:red'>❌</a>
  </div>";
 }

 echo "</div></div>";
}

if($dep_actual != ""){
 echo "</div>";
}
?>

</div>
<?php endif; ?>

<?php if($vista=='salidas'): ?>

<div class="card">

<h2>📦 Salida de Almacén</h2>

<?php if(isset($_GET['ok'])): ?>
<div style="
background:#dcfce7;
color:#166534;
padding:12px;
border-radius:10px;
margin-bottom:15px;
font-weight:600;
">
✅ Salida registrada correctamente
</div>
<?php endif; ?>

<?php if(isset($_GET['error']) && $_GET['error']=='folio'): ?>
<div style="
background:#fee2e2;
color:#991b1b;
padding:12px;
border-radius:10px;
margin-bottom:15px;
font-weight:600;
">
❌ Ese folio ya existe — la salida NO se registró
</div>
<?php endif; ?>

<form method="POST">

<div class="form-grid">

<div class="form-card">
<label>Folio</label>

<input
type="text"
name="folio"
required
placeholder="Ej: SAL-0001"
>

</div>

<div class="form-card">
<label>Nombre</label>
<input type="text" name="nombre" required>
</div>

<div class="form-card">
<label>Proveedor</label>
<input type="text" name="proveedor" required>
</div>

</div>

<br>

<label>Observaciones</label>

<textarea
name="observaciones"
required
style="
width:100%;
height:180px;
padding:15px;
border-radius:12px;
border:1px solid #d1d5db;
font-family:Segoe UI;
resize:vertical;
"
placeholder="Escribe observaciones..."
></textarea>

<br><br>

<button name="crear_salida">
📄 Generar salida PDF
</button>

</form>

</div>

<?php endif; ?>


<?php if($vista=='pdf_salidas'): ?>

<div class="card">

<h2>📄 PDFs Salidas de Almacén</h2>

<div class="buscador-bar">

<input
type="text"
id="buscarSalida"
class="buscador-input"
placeholder="🔍 Buscar por nombre, observaciones o folio..."
>

<button
id="limpiarSalida"
class="btn-clear"
type="button"
>
✕
</button>

</div>

<table>

<tr>
<th>Folio</th>
<th>Nombre</th>
<th>Proveedor</th>
<th style="width:120px"></th>
<th style="width:140px"></th>
</tr>

<?php

$salidas = $conn->query("
SELECT *
FROM salidas_almacen
ORDER BY id_salida DESC
");

while($s=$salidas->fetch_assoc()){

 $search = htmlspecialchars(strtolower(strip_tags(
   $s['folio']." ".
   $s['nombre']." ".
   $s['observaciones']
 )), ENT_QUOTES);

 $folioTd = htmlspecialchars($s['folio']);
 $nombreTd = htmlspecialchars($s['nombre']);
 $provTd = htmlspecialchars($s['proveedor']);
 $pdfHref = htmlspecialchars(rawurlencode(basename($s['pdf'])));

 echo "

<tr class='filaSalida'
data-search='$search'>

<td>{$folioTd}</td>

<td>{$nombreTd}</td>

<td>{$provTd}</td>

<td>
<a
href='salidas_pdf/{$pdfHref}'
target='_blank'
class='btn-pdf'
>
📄 PDF
</a>
</td>

<td>

<a
href='?vista=pdf_salidas&eliminar_salida={$s['id_salida']}'
onclick='return confirm(`¿Eliminar salida y PDF?`)'
style='
background:#ef4444;
color:white;
padding:8px 12px;
border-radius:8px;
text-decoration:none;
font-size:12px;
font-weight:bold;
display:inline-block;
'
>
🗑 Eliminar
</a>

</td>

</tr>

 ";
}
?>

</table>

</div>

<script>

document.addEventListener("DOMContentLoaded", function(){

 let input = document.getElementById("buscarSalida");
 let limpiar = document.getElementById("limpiarSalida");

 function filtrar(){

   let val = input.value.toLowerCase();

   document.querySelectorAll(".filaSalida").forEach(fila => {

      let texto = fila.getAttribute("data-search");

      fila.style.display = texto.includes(val)
      ? ""
      : "none";

   });

 }

 input.addEventListener("keyup", filtrar);

 limpiar.addEventListener("click", function(){

   input.value = "";
   filtrar();
   input.focus();

 });

});

</script>

<?php endif; ?>




<!-- ASIGNAR -->
<?php if($vista=='asignar'): ?>
<div class="card">
<h2>📦 Asignar herramientas</h2>

<!-- FILTROS -->
<form method="GET">
<input type="hidden" name="vista" value="asignar">

<div class="asignar-top">

<div class="asignar-box">
<label>👤 Empleado</label>
<select id="selectEmpleado">
<option value="">Selecciona empleado</option>
<?php
$emp_sel = $_GET['empleado'] ?? '';
$e=$conn->query("
SELECT e.*, d.nombre departamento
FROM empleados e
LEFT JOIN departamentos d ON e.departamento_id=d.id_departamento
WHERE e.activo = 1
ORDER BY d.nombre, e.nombre
");

$dep_actual = "";

while($r=$e->fetch_assoc()){

 if($dep_actual != $r['departamento']){

  if($dep_actual != ""){
   echo "</optgroup>";
  }

  $dep_actual = $r['departamento'];

  echo "<optgroup label='📁 {$dep_actual}'>";
 }

 $selected = ($emp_sel == $r['id_empleado']) ? "selected" : "";

 echo "<option value='{$r['id_empleado']}' $selected>{$r['nombre']}</option>";
}

if($dep_actual != ""){
 echo "</optgroup>";
}
?>
</select>
</div>

<div class="asignar-box">
<label>🏷 Categoría</label>
<select id="selectCategoria">
<option value="">Todas</option>
<?php
$c=$conn->query("SELECT * FROM categorias");
while($cat=$c->fetch_assoc()){
 $selected = (($_GET['categoria'] ?? '')==$cat['id_categoria'])?"selected":"";
 echo "<option value='{$cat['id_categoria']}' $selected>{$cat['nombre']}</option>";
}
?>
</select>
</div>

</div>
</form>

<!-- BUSCADOR DE HERRAMIENTAS -->
<div class="buscador-bar">
<input type="text" id="buscarToolAsignar" class="buscador-input" placeholder="🔍 Buscar herramienta...">
<button type="button" id="limpiarToolAsignar" class="btn-clear">✕</button>
<span id="contadorToolsAsignar" class="resultados"></span>
</div>

<!-- FORM ASIGNAR -->
<form method="POST">

<input type="hidden" name="empleado" value="<?= $_GET['empleado'] ?? '' ?>">

<div class="tools-grid" id="contenedorTools">

<?php
if(isset($_GET['categoria']) && $_GET['categoria']!=""){
 $cat=$_GET['categoria'];
 $h=$conn->query("
 SELECT h.*, c.nombre categoria
 FROM herramientas h
 LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
 WHERE h.categoria_id='$cat'
 ");
}else{
 $h=$conn->query("
 SELECT h.*, c.nombre categoria
 FROM herramientas h
 LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
 ");
}

while($r=$h->fetch_assoc()){
 $idh = intval($r['id_herramienta']);
 $nomAttr = htmlspecialchars($r['nombre'] ?? '', ENT_QUOTES);
 $imgAttr = htmlspecialchars($r['imagen'] ?? '', ENT_QUOTES);
 $catAttr = htmlspecialchars($r['categoria'] ?? '', ENT_QUOTES);
 $dataNombre = htmlspecialchars(strtolower(($r['nombre'] ?? '')." ".($r['categoria'] ?? '')), ENT_QUOTES);

 echo "
 <label class='tool-card' data-nombre='{$dataNombre}'>
   <input type='checkbox' name='herramientas[]' value='{$idh}' hidden>
   <img src='uploads/{$imgAttr}' onerror=\"this.src='https://cdn-icons-png.flaticon.com/512/809/809957.png'\">
   <div>{$nomAttr}</div>
   <small>{$catAttr}</small>
   <div class='cant-box' onclick='event.stopPropagation()'>Cant.
     <input type='number' class='cant-input' name='cantidad[{$idh}]' value='1' min='1' max='999'>
   </div>
 </label>
 ";
}
?>

</div>
<div id="contadorSeleccion" style="
margin-top:10px;
font-size:14px;
font-weight:600;
color:#374151;
">
Seleccionadas: 0
</div>

<button class="btn-asignar">Asignar herramientas</button>

</form>

</div>
<?php endif; ?>


</div>
</div>
<div class="bottom-nav">
 <a href="?vista=dashboard">🏠</a>
 <a href="?vista=crear">➕</a>
 <a href="?vista=asignar">📦</a>
 <a href="?vista=empleados">👤</a>
 <a href="?vista=asignaciones">📋</a>
</div>

<script>
function toggle(id){
 let el = document.getElementById("emp"+id);

 if(el.style.display === "block"){
  el.style.display = "none";
 }else{
  el.style.display = "block";
 }
}
</script>


<script>
document.addEventListener("DOMContentLoaded", function(){

 let btn = document.querySelector(".btn-asignar");

 if(btn){
  btn.addEventListener("click", function(e){

   let total = document.querySelectorAll(".tool-card.selected").length;

   if(total === 0){
    e.preventDefault();
    alert("⚠️ Selecciona al menos una herramienta");
   }

  });
 }

});
</script>
          

<script>
document.addEventListener("DOMContentLoaded", function(){

 let input = document.getElementById("buscarEmpleado");
 let limpiar = document.getElementById("limpiarBusqueda");
 let contador = document.getElementById("contadorResultados");
 let mensaje = document.getElementById("noResultados");

 function actualizarBusqueda(){

  let valor = input.value.toLowerCase();
  let deptos = document.querySelectorAll(".empleados-grid");

  // 🔥 SIN TEXTO → TODO CERRADO
  if(valor === ""){
   deptos.forEach(dep => {
    dep.style.display = "none";
    dep.previousElementSibling.style.display = "block";
   });

   contador.innerText = "";
   mensaje.style.display = "none";
   return;
  }

  let visibles = 0;

  deptos.forEach(dep => {

   let empleados = dep.querySelectorAll(".empleado-item");
   let deptoVisible = false;

   empleados.forEach(emp => {

    let nombre = emp.getAttribute("data-nombre");

    if(nombre.includes(valor)){
     deptoVisible = true;
     visibles++;
    }

   });

   // 🔥 SOLO MOSTRAR DEPARTAMENTOS
   if(deptoVisible){
    dep.style.display = "none";
    dep.previousElementSibling.style.display = "block";
   }else{
    dep.style.display = "none";
    dep.previousElementSibling.style.display = "none";
   }

  });

  contador.innerText = visibles + " resultado(s)";
  mensaje.style.display = visibles === 0 ? "block" : "none";
 }

 input.addEventListener("keyup", actualizarBusqueda);

 limpiar.addEventListener("click", function(){
  input.value = "";
  actualizarBusqueda();
  input.focus();
 });

});
</script>

<script>
function toggleDepto(id){

 let el = document.getElementById(id);

 // 🔥 CASO ASIGNACIONES (no hay buscador)
 let buscador = document.getElementById("buscarEmpleado");

 if(!buscador){
  el.style.display = (el.style.display === "none") ? "block" : "none";
  return;
 }

 // 🔥 CASO EMPLEADOS (con buscador)
 let valor = buscador.value.toLowerCase();

 if(el.style.display === "none"){

  el.style.display = "grid";

  let empleados = el.querySelectorAll(".empleado-item");

  empleados.forEach(emp => {

   let nombre = emp.getAttribute("data-nombre");

   if(valor === "" || nombre.includes(valor)){
    emp.style.display = "flex";
   }else{
    emp.style.display = "none";
   }

  });

 }else{
  el.style.display = "none";
 }

}
</script>

<script>
function toggleEmp(id){

 let todos = document.querySelectorAll(".herramientas-list");

 // cerrar todos menos el actual
 todos.forEach(el => {
  if(el.id !== "emp"+id){
   el.style.display = "none";
  }
 });

 let actual = document.getElementById("emp"+id);

 // toggle del actual
 if(actual.style.display === "block"){
  actual.style.display = "none";
 }else{
  actual.style.display = "block";
 }

}
</script>

<script>
document.addEventListener("DOMContentLoaded", function(){

 let input = document.getElementById("buscarHerramienta");

 if(!input) return;

 let tools = document.querySelectorAll(".tool-item");

 input.addEventListener("keyup", function(){

  let valor = input.value.toLowerCase();

  let categorias = document.querySelectorAll(".categoria");

categorias.forEach(cat => {

 let tools = cat.querySelectorAll(".tool-item");
 let visible = false;

 tools.forEach(tool => {

  let nombre = (tool.getAttribute("data-nombre") || "").toLowerCase();

  if(nombre.includes(valor)){
   tool.style.display = "block";
   visible = true;
  }else{
   tool.style.display = "none";
  }

 });

 // 🔥 abrir solo si hay resultados
 if(valor === ""){
  cat.style.display = "none";
 }else{
  cat.style.display = visible ? "grid" : "none";
 }

});

 });

});
</script>

<script>
function toggleCategoria(id){

 let el = document.getElementById(id);
 let flecha = event.currentTarget.querySelector(".flecha");

 if(el.style.display === "none"){
  el.style.display = "grid";
  flecha.style.transform = "rotate(90deg)";
 }else{
  el.style.display = "none";
  flecha.style.transform = "rotate(0deg)";
 }

}
</script>

<script>
function abrirModal(img, nombre){
 document.getElementById("modalTool").style.display = "flex";
 document.getElementById("modalImg").src = img;
 document.getElementById("modalNombre").innerText = nombre;
}

function cerrarModal(){
 document.getElementById("modalTool").style.display = "none";
}

// cerrar si das click fuera
document.addEventListener("click", function(e){

 let modal = document.getElementById("modalTool");
 let contenido = document.querySelector(".modal-content");

 // 🔥 solo si el modal ya está abierto
 if(modal.style.display === "flex"){

  // 🔥 ignorar clicks en herramientas
  if(e.target.closest(".card-tool")) return;

  // 🔥 cerrar si es fuera del contenido
  if(!contenido.contains(e.target)){
   cerrarModal();
  }

 }

});
</script>

<script>

function cargarHerramientas(){

 let emp = document.getElementById("selectEmpleado").value;
 let cat = document.getElementById("selectCategoria").value;

 document.querySelector("input[name='empleado']").value = emp;

 fetch(`ajax_herramientas.php?empleado=${emp}&categoria=${cat}`)
  .then(res => res.text())
  .then(html => {

   document.getElementById("contenedorTools").innerHTML = html;

   document.querySelectorAll(".tool-card input[type='checkbox']").forEach(cb => {

    cb.addEventListener("change", function(){

     let card = this.closest(".tool-card");

     if(this.checked){
      card.classList.add("selected");
     }else{
      card.classList.remove("selected");
     }

     actualizarContador();
    });

   });

   filtrarToolsAsignar();
   actualizarContador();

  });

}

function filtrarToolsAsignar(){

 let inp = document.getElementById("buscarToolAsignar");
 if(!inp) return;

 let val = inp.value.toLowerCase();
 let visibles = 0;

 document.querySelectorAll("#contenedorTools .tool-card").forEach(card => {

  let nombre = (card.getAttribute("data-nombre") || "").toLowerCase();

  if(val === "" || nombre.includes(val)){
   card.style.display = "flex";
   visibles++;
  }else{
   card.style.display = "none";
  }

 });

 let cont = document.getElementById("contadorToolsAsignar");
 if(cont){
  cont.innerText = val === "" ? "" : visibles + " resultado(s)";
 }
}

// 🔥 EVENTOS (TE FALTABAN)
document.addEventListener("DOMContentLoaded", function(){

 cargarHerramientas();

 document.getElementById("selectEmpleado").addEventListener("change", cargarHerramientas);
 document.getElementById("selectCategoria").addEventListener("change", cargarHerramientas);

 // buscador de herramientas
 let buscar = document.getElementById("buscarToolAsignar");

 if(buscar){

  buscar.addEventListener("keyup", filtrarToolsAsignar);

  buscar.addEventListener("keydown", function(e){
   if(e.key === "Enter") e.preventDefault();
  });

  document.getElementById("limpiarToolAsignar").addEventListener("click", function(){
   buscar.value = "";
   filtrarToolsAsignar();
   buscar.focus();
  });
 }

});

</script>
<script>
function actualizarContador(){

 let total = document.querySelectorAll(".tool-card.selected").length;
 let contador = document.getElementById("contadorSeleccion");

 if(contador){
  contador.innerText = "Seleccionadas: " + total;
 }

}
</script>

<div id="modalTool" class="modal">
  <div class="modal-content">
    <span class="close" onclick="cerrarModal()">✖</span>
    <img id="modalImg">
    <div id="modalNombre"></div>
  </div>
</div>

</body>
</html>