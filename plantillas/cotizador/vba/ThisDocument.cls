VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ThisDocument"
Attribute VB_Base = "1Normal.ThisDocument"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Attribute VB_TemplateDerived = True
Attribute VB_Customizable = True
Option Explicit

' Al abrir la plantilla se registran los atajos de teclado.
Private Sub Document_Open()
    On Error Resume Next
    Cotizador.RegistrarAtajos
End Sub

Private Sub Document_New()
    On Error Resume Next
    Cotizador.RegistrarAtajos
End Sub

' Cuando cambia la lista "Modalidad / Ruta" de un concepto, se recargan las
' opciones de la lista "Tabulador / Zona / Servicio" de esa misma fila.
Private Sub Document_ContentControlOnExit(ByVal ContentControl As ContentControl, _
                                          Cancel As Boolean)
    On Error Resume Next
    If Left$(ContentControl.Tag, 4) = "mod_" Then
        Cotizador.ActualizarListaDeFila ContentControl
    End If
End Sub
