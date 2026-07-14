<?php
$conn=new mysqli("localhost","root","","control_herramientas");
$conn->set_charset('utf8mb4');

$id = intval($_GET['id']);

$conn->query("UPDATE asignaciones SET activa=0 WHERE id_asignacion='$id'");
