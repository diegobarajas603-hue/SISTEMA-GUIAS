<?php
$conn=new mysqli("localhost","root","","control_herramientas");
$conn->set_charset('utf8mb4');

$empleado = $_GET['empleado'] ?? '';
$categoria = $_GET['categoria'] ?? '';

$where = "";

if($categoria != ""){
 $where .= " AND h.categoria_id='".intval($categoria)."'";
}

$q=$conn->query("
SELECT h.*, c.nombre categoria
FROM herramientas h
LEFT JOIN categorias c ON h.categoria_id=c.id_categoria
WHERE 1 $where
");

while($r=$q->fetch_assoc()){
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