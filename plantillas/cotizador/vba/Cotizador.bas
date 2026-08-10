Attribute VB_Name = "Cotizador"
Option Explicit

' ==========================================================================
'  COTIZADOR  ·  FLETES TAURO
' --------------------------------------------------------------------------
'  Este modulo arma la tabla de conceptos que ve el cliente a partir de lo
'  seleccionado en el PANEL DE COTIZACION y de las tarifas capturadas en la
'  seccion TABULADORES Y TARIFAS.
'
'  Macros que puedes ejecutar (Vista > Macros):
'    GenerarCotizacion       Ctrl+Shift+G   calcula importes y arma la tabla
'    ExportarCotizacionPDF   Ctrl+Shift+P   genera el documento limpio y el PDF
'    GenerarCotizacionLimpia                solo el documento Word limpio
'    ActualizarListas                       recarga las listas desplegables
'    NuevaCotizacion                        limpia datos para empezar de cero
'
'  Las tablas NO se buscan por posicion sino por su titulo interno
'  (Word: clic derecho en la tabla > Propiedades de tabla > Texto alternativo).
'  Por eso puedes mover, agregar o quitar contenido sin romper el macro.
' ==========================================================================

Private Const T_CONCEPTOS   As String = "tblConceptos"
Private Const T_PANEL       As String = "panelConceptos"
Private Const T_OPCIONES    As String = "panelOpciones"
Private Const T_RECOLECCION As String = "tabRecoleccion"
Private Const T_ENTREGA     As String = "tabEntrega"
Private Const T_ZONAS       As String = "tabZonas"
Private Const T_FLETES      As String = "tabFletes"
Private Const T_MANIOBRAS   As String = "tabManiobras"
Private Const T_SEGURO      As String = "tabSeguro"
Private Const T_CITA        As String = "tabCita"

Private Const TASA_IVA As Double = 0.16

' Colores corporativos (Word usa enteros BGR)
Private Const C_NAVY    As Long = &H462B0F   ' 0F2B46
Private Const C_BLANCO  As Long = &HFFFFFF   ' FFFFFF
Private Const C_GRAFITO As Long = &H3D3833   ' 33383D
Private Const C_GRIS    As Long = &H686E6E   ' 6E6E68
Private Const C_LINEA   As Long = &HF0EDEB   ' EBEDF0
Private Const C_FONDO   As Long = &HF8F6F5   ' F5F6F8
Private Const C_CHAMP   As Long = &H5A97B4   ' B4975A

Private Const F_TEXTO As String = "Segoe UI"
Private Const F_FUERTE As String = "Segoe UI Semibold"


' ==========================================================================
'  1. MACRO PRINCIPAL
' ==========================================================================
Public Sub GenerarCotizacion()
    Dim doc As Document, panel As Table, dest As Table
    Dim i As Long, n As Long, k As Long
    Dim etiquetas() As String, importes() As Double
    Dim peso As Double, valorDecl As Double, total As Double
    Dim conIva As Boolean, avisos As String
    Dim etq As String, modalidad As String, opcion As String
    Dim clave As String, manual As Double, imp As Double
    Dim fila As Row

    Set doc = ActiveDocument
    Set panel = TablaPorTitulo(doc, T_PANEL)
    Set dest = TablaPorTitulo(doc, T_CONCEPTOS)

    If panel Is Nothing Then
        MsgBox "No encuentro la tabla CONCEPTOS A INCLUIR del panel." & vbCrLf & _
               "Verifica que su texto alternativo siga siendo """ & T_PANEL & """.", _
               vbExclamation, "Cotizador Fletes Tauro"
        Exit Sub
    End If
    If dest Is Nothing Then
        MsgBox "No encuentro la tabla de conceptos de la cotizacion." & vbCrLf & _
               "Verifica que su texto alternativo siga siendo """ & T_CONCEPTOS & """.", _
               vbExclamation, "Cotizador Fletes Tauro"
        Exit Sub
    End If

    peso = ANumero(TextoControl(doc, "merc_peso"))
    valorDecl = ANumero(TextoControl(doc, "merc_valor"))
    conIva = (UCase$(Left$(TextoControl(doc, "opt_iva") & " ", 1)) = "S")

    ReDim etiquetas(1 To panel.Rows.Count)
    ReDim importes(1 To panel.Rows.Count)
    n = 0

    For i = 2 To panel.Rows.Count
        If FilaMarcada(panel, i) Then
            etq = CeldaTexto(panel, i, 2)
            modalidad = CeldaTexto(panel, i, 3)
            opcion = CeldaTexto(panel, i, 4)
            manual = ANumero(CeldaTexto(panel, i, 5))
            clave = ClaveDe(etq)

            imp = ImporteConcepto(doc, clave, modalidad, opcion, manual, peso, valorDecl)
            If imp = 0 Then
                avisos = avisos & "   ·  " & etq & vbCrLf
            End If

            EscribirCelda panel, i, 5, Moneda(imp)

            n = n + 1
            etiquetas(n) = EtiquetaCliente(clave, etq, modalidad)
            importes(n) = imp
            total = total + imp
        End If
    Next i

    If n = 0 Then
        MsgBox "No hay ningun concepto marcado en el panel." & vbCrLf & _
               "Marca al menos una casilla y vuelve a ejecutar el macro.", _
               vbInformation, "Cotizador Fletes Tauro"
        Exit Sub
    End If

    On Error GoTo ErrGen
    Application.ScreenUpdating = False

    ' -- Reconstruir la tabla del cliente: se conservan el encabezado (fila 1)
    '    y la fila de TOTAL (ultima); todo lo de en medio se vuelve a generar.
    For i = dest.Rows.Count - 1 To 2 Step -1
        dest.Rows(i).Delete
    Next i

    For k = 1 To n
        Set fila = dest.Rows.Add(BeforeRow:=dest.Rows(dest.Rows.Count))
        FormatoFilaConcepto fila, (k Mod 2 = 0)
        fila.Cells(1).Range.Text = etiquetas(k)
        fila.Cells(2).Range.Text = Moneda(importes(k))
    Next k

    If conIva Then
        AgregarFilaResumen dest, "SUBTOTAL", total
        AgregarFilaResumen dest, "IVA 16%", Redondear(total * TASA_IVA)
        total = Redondear(total * (1 + TASA_IVA))
    End If

    FormatoFilaTotal dest.Rows(dest.Rows.Count)
    dest.Cell(dest.Rows.Count, 1).Range.Text = "TOTAL"
    dest.Cell(dest.Rows.Count, 2).Range.Text = Moneda(total)

    Application.ScreenUpdating = True

    If Len(avisos) > 0 Then
        MsgBox "Cotizacion generada con " & n & " concepto(s)." & vbCrLf & _
               "TOTAL: " & Moneda(total) & vbCrLf & vbCrLf & _
               "Ojo: estos conceptos quedaron en cero porque no encontre su " & _
               "tarifa en el tabulador:" & vbCrLf & avisos & vbCrLf & _
               "Revisa la opcion elegida o captura el importe a mano.", _
               vbExclamation, "Cotizador Fletes Tauro"
    Else
        MsgBox "Cotizacion generada con " & n & " concepto(s)." & vbCrLf & _
               "TOTAL: " & Moneda(total), vbInformation, "Cotizador Fletes Tauro"
    End If
    Exit Sub

ErrGen:
    Application.ScreenUpdating = True
    MsgBox "Ocurrio un error al generar la cotizacion:" & vbCrLf & vbCrLf & _
           Err.Description, vbCritical, "Cotizador Fletes Tauro"
End Sub


' ==========================================================================
'  2. CALCULO DE IMPORTES
' ==========================================================================
Private Function ImporteConcepto(ByVal doc As Document, ByVal clave As String, _
                                 ByVal modalidad As String, ByVal opcion As String, _
                                 ByVal manual As Double, ByVal peso As Double, _
                                 ByVal valorDecl As Double) As Double
    Dim m As String, o As String, tabla As String, colZona As Long

    m = UCase$(SinAcentos(modalidad))
    o = UCase$(SinAcentos(opcion))

    ' Cualquier concepto puede forzarse a importe capturado a mano.
    If InStr(m, "MANUAL") > 0 Or InStr(o, "PERSONALIZADO") > 0 Then
        ImporteConcepto = manual
        Exit Function
    End If

    Select Case clave
        Case "RECOLECCION", "ENTREGA"
            If clave = "RECOLECCION" Then
                colZona = 3
                tabla = T_RECOLECCION
            Else
                colZona = 4
                tabla = T_ENTREGA
            End If
            If InStr(m, "FUERA") > 0 Then
                ImporteConcepto = BuscarEnTabla(doc, T_ZONAS, 1, opcion, colZona)
            ElseIf InStr(o, "AUTOMATICO") > 0 Or Len(Trim$(o)) = 0 Then
                ImporteConcepto = TarifaPorPeso(doc, tabla, peso)
            Else
                ImporteConcepto = BuscarEnTabla(doc, tabla, 1, opcion, 3)
            End If

        Case "FLETE"
            ImporteConcepto = BuscarEnTabla2(doc, T_FLETES, 1, modalidad, 2, opcion, 3)

        Case "MANIOBRAS"
            ImporteConcepto = BuscarEnTabla(doc, T_MANIOBRAS, 1, opcion, 2)

        Case "SEGURO"
            If InStr(o, "ESTANDAR") > 0 Then
                ' Consideracion 4: $8.00 por cada millar del valor declarado.
                ImporteConcepto = Redondear(valorDecl / 1000# * _
                                  BuscarEnTabla(doc, T_SEGURO, 1, opcion, 3))
            Else
                ImporteConcepto = BuscarEnTabla(doc, T_SEGURO, 1, opcion, 3)
            End If

        Case "CITA"
            ImporteConcepto = BuscarEnTabla(doc, T_CITA, 1, opcion, 2)

        Case Else
            ' Concepto agregado por el usuario: se usa el importe capturado.
            ImporteConcepto = manual
    End Select
End Function


Private Function ClaveDe(ByVal etiqueta As String) As String
    Dim s As String
    s = UCase$(SinAcentos(etiqueta))
    If InStr(s, "CITA") > 0 Then
        ClaveDe = "CITA"
    ElseIf InStr(s, "SEGURO") > 0 Then
        ClaveDe = "SEGURO"
    ElseIf InStr(s, "MANIOBRA") > 0 Then
        ClaveDe = "MANIOBRAS"
    ElseIf InStr(s, "FLETE") > 0 Then
        ClaveDe = "FLETE"
    ElseIf InStr(s, "RECOLEC") > 0 Then
        ClaveDe = "RECOLECCION"
    ElseIf InStr(s, "ENTREGA") > 0 Then
        ClaveDe = "ENTREGA"
    Else
        ClaveDe = "MANUAL"
    End If
End Function


Private Function EtiquetaCliente(ByVal clave As String, ByVal etiqueta As String, _
                                 ByVal modalidad As String) As String
    If clave = "FLETE" And InStr(UCase$(SinAcentos(modalidad)), "MANUAL") = 0 _
       And Len(Trim$(modalidad)) > 0 Then
        EtiquetaCliente = "Flete " & Replace(modalidad, ChrW(8594), ChrW(8211))
    Else
        EtiquetaCliente = etiqueta
    End If
End Function


Private Function TarifaPorPeso(ByVal doc As Document, ByVal titulo As String, _
                               ByVal peso As Double) As Double
    Dim t As Table, i As Long
    Set t = TablaPorTitulo(doc, titulo)
    If t Is Nothing Then Exit Function
    For i = 2 To t.Rows.Count
        If peso <= ANumero(CeldaTexto(t, i, 2)) Then
            TarifaPorPeso = ANumero(CeldaTexto(t, i, 3))
            Exit Function
        End If
    Next i
    TarifaPorPeso = ANumero(CeldaTexto(t, t.Rows.Count, 3))
End Function


Private Function BuscarEnTabla(ByVal doc As Document, ByVal titulo As String, _
                               ByVal colClave As Long, ByVal clave As String, _
                               ByVal colValor As Long) As Double
    Dim t As Table, i As Long
    Set t = TablaPorTitulo(doc, titulo)
    If t Is Nothing Then Exit Function
    For i = 2 To t.Rows.Count
        If Igual(CeldaTexto(t, i, colClave), clave) Then
            BuscarEnTabla = ANumero(CeldaTexto(t, i, colValor))
            Exit Function
        End If
    Next i
End Function


Private Function BuscarEnTabla2(ByVal doc As Document, ByVal titulo As String, _
                                ByVal col1 As Long, ByVal val1 As String, _
                                ByVal col2 As Long, ByVal val2 As String, _
                                ByVal colValor As Long) As Double
    Dim t As Table, i As Long
    Set t = TablaPorTitulo(doc, titulo)
    If t Is Nothing Then Exit Function
    For i = 2 To t.Rows.Count
        If Igual(CeldaTexto(t, i, col1), val1) And Igual(CeldaTexto(t, i, col2), val2) Then
            BuscarEnTabla2 = ANumero(CeldaTexto(t, i, colValor))
            Exit Function
        End If
    Next i
End Function


' ==========================================================================
'  3. LISTAS DESPLEGABLES DEPENDIENTES
' ==========================================================================
' Se llama desde ThisDocument cuando el usuario sale de una lista "Modalidad".
Public Sub ActualizarListaDeFila(ByVal ccMod As ContentControl)
    Dim doc As Document, panel As Table, f As Long
    On Error GoTo Fin
    Set doc = ActiveDocument
    Set panel = TablaPorTitulo(doc, T_PANEL)
    If panel Is Nothing Then Exit Sub
    f = ccMod.Range.Cells(1).RowIndex
    RecargarFila doc, panel, f
Fin:
End Sub


Public Sub ActualizarListas()
    Dim doc As Document, panel As Table, f As Long
    Set doc = ActiveDocument
    Set panel = TablaPorTitulo(doc, T_PANEL)
    If panel Is Nothing Then Exit Sub
    Application.ScreenUpdating = False
    For f = 2 To panel.Rows.Count
        RecargarFila doc, panel, f
    Next f
    Application.ScreenUpdating = True
    MsgBox "Listas desplegables actualizadas con las tarifas vigentes.", _
           vbInformation, "Cotizador Fletes Tauro"
End Sub


Private Sub RecargarFila(ByVal doc As Document, ByVal panel As Table, ByVal f As Long)
    Dim clave As String, modalidad As String, actual As String
    Dim cc As ContentControl
    Dim items As Collection

    On Error GoTo Fin
    clave = ClaveDe(CeldaTexto(panel, f, 2))
    modalidad = UCase$(SinAcentos(CeldaTexto(panel, f, 3)))
    Set cc = PrimerControl(panel.Cell(f, 4))
    If cc Is Nothing Then Exit Sub
    If cc.Type <> wdContentControlDropdownList Then Exit Sub

    Set items = New Collection

    Select Case clave
        Case "RECOLECCION", "ENTREGA"
            If InStr(modalidad, "MANUAL") > 0 Then
                items.Add "Personalizado (capturar importe)"
            ElseIf InStr(modalidad, "FUERA") > 0 Then
                AgregarColumna items, doc, T_ZONAS, 1
            Else
                items.Add "Automático por peso"
                If clave = "RECOLECCION" Then
                    AgregarColumna items, doc, T_RECOLECCION, 1
                Else
                    AgregarColumna items, doc, T_ENTREGA, 1
                End If
            End If
        Case "FLETE"
            AgregarColumnaUnica items, doc, T_FLETES, 2
        Case "MANIOBRAS"
            AgregarColumna items, doc, T_MANIOBRAS, 1
        Case "SEGURO"
            AgregarColumna items, doc, T_SEGURO, 1
        Case "CITA"
            AgregarColumna items, doc, T_CITA, 1
        Case Else
            items.Add "Personalizado (capturar importe)"
    End Select

    If items.Count = 0 Then Exit Sub

    actual = Trim$(cc.Range.Text)
    cc.DropdownListEntries.Clear
    Dim j As Long
    For j = 1 To items.Count
        cc.DropdownListEntries.Add Text:=items(j), Value:=items(j)
    Next j

    ' Si la opcion que estaba elegida ya no existe, se toma la primera.
    If Not EstaEnColeccion(items, actual) Then
        cc.Range.Text = items(1)
    End If
Fin:
End Sub


Private Sub AgregarColumna(ByVal items As Collection, ByVal doc As Document, _
                           ByVal titulo As String, ByVal col As Long)
    Dim t As Table, i As Long, v As String
    Set t = TablaPorTitulo(doc, titulo)
    If t Is Nothing Then Exit Sub
    For i = 2 To t.Rows.Count
        v = CeldaTexto(t, i, col)
        If Len(v) > 0 Then items.Add v
    Next i
End Sub


Private Sub AgregarColumnaUnica(ByVal items As Collection, ByVal doc As Document, _
                                ByVal titulo As String, ByVal col As Long)
    Dim t As Table, i As Long, v As String
    Set t = TablaPorTitulo(doc, titulo)
    If t Is Nothing Then Exit Sub
    For i = 2 To t.Rows.Count
        v = CeldaTexto(t, i, col)
        If Len(v) > 0 And Not EstaEnColeccion(items, v) Then items.Add v
    Next i
End Sub


Private Function EstaEnColeccion(ByVal items As Collection, ByVal v As String) As Boolean
    Dim j As Long
    For j = 1 To items.Count
        If Igual(items(j), v) Then
            EstaEnColeccion = True
            Exit Function
        End If
    Next j
End Function


' ==========================================================================
'  4. DOCUMENTO LIMPIO Y PDF
' ==========================================================================
Public Sub GenerarCotizacionLimpia()
    Dim nd As Document
    GenerarCotizacion
    Set nd = DocumentoLimpio(True)
    If nd Is Nothing Then Exit Sub
    nd.Activate
End Sub


Public Sub ExportarCotizacionPDF()
    Dim src As Document, nd As Document
    Dim carpeta As String, base As String, rutaPdf As String, rutaDoc As String

    Set src = ActiveDocument
    GenerarCotizacion

    base = NombreArchivo(src)
    carpeta = CarpetaDestino(src)

    Set nd = DocumentoLimpio(False)
    If nd Is Nothing Then Exit Sub

    rutaPdf = carpeta & base & ".pdf"
    rutaDoc = carpeta & base & ".docx"

    On Error GoTo ErrExport
    nd.ExportAsFixedFormat OutputFileName:=rutaPdf, _
                           ExportFormat:=wdExportFormatPDF, _
                           OpenAfterExport:=False, _
                           OptimizeFor:=wdExportOptimizeForPrint, _
                           Range:=wdExportAllDocument, _
                           Item:=wdExportDocumentContent, _
                           IncludeDocProps:=True, _
                           CreateBookmarks:=wdExportCreateNoBookmarks
    nd.SaveAs2 FileName:=rutaDoc, FileFormat:=wdFormatXMLDocument
    nd.Close SaveChanges:=False

    MsgBox "Cotizacion lista para enviar:" & vbCrLf & vbCrLf & _
           rutaPdf & vbCrLf & rutaDoc, vbInformation, "Cotizador Fletes Tauro"
    Exit Sub

ErrExport:
    MsgBox "No pude guardar el archivo en:" & vbCrLf & carpeta & vbCrLf & vbCrLf & _
           "El documento limpio queda abierto para que lo guardes a mano.", _
           vbExclamation, "Cotizador Fletes Tauro"
    On Error Resume Next
    nd.Windows(1).Visible = True
    nd.Activate
End Sub


Private Function DocumentoLimpio(ByVal mostrar As Boolean) As Document
    Dim src As Document, nd As Document, sec As Section
    Dim i As Long

    Set src = ActiveDocument
    Set sec = src.Sections(SeccionCotizacion(src))

    Application.ScreenUpdating = False
    Set nd = Documents.Add(Visible:=mostrar)

    With nd.Sections(1).PageSetup
        .PageWidth = sec.PageSetup.PageWidth
        .PageHeight = sec.PageSetup.PageHeight
        .TopMargin = sec.PageSetup.TopMargin
        .BottomMargin = sec.PageSetup.BottomMargin
        .LeftMargin = sec.PageSetup.LeftMargin
        .RightMargin = sec.PageSetup.RightMargin
        .HeaderDistance = sec.PageSetup.HeaderDistance
        .FooterDistance = sec.PageSetup.FooterDistance
    End With

    nd.Content.FormattedText = src.Range(sec.Range.Start, sec.Range.End - 1).FormattedText

    nd.Sections(1).Headers(wdHeaderFooterPrimary).Range.FormattedText = _
        sec.Headers(wdHeaderFooterPrimary).Range.FormattedText
    nd.Sections(1).Footers(wdHeaderFooterPrimary).Range.FormattedText = _
        sec.Footers(wdHeaderFooterPrimary).Range.FormattedText

    ' El cliente no debe ver controles de contenido: se quitan conservando el texto.
    For i = nd.ContentControls.Count To 1 Step -1
        With nd.ContentControls(i)
            .LockContents = False
            .LockContentControl = False
            .Delete False
        End With
    Next i

    Application.ScreenUpdating = True
    Set DocumentoLimpio = nd
End Function


Private Function SeccionCotizacion(ByVal doc As Document) As Long
    Dim t As Table
    On Error GoTo PorDefecto
    ' La seccion buena es la que contiene la tabla de conceptos del cliente.
    Set t = TablaPorTitulo(doc, T_CONCEPTOS)
    If Not t Is Nothing Then
        SeccionCotizacion = t.Range.Sections(1).Index
        If SeccionCotizacion >= 1 Then Exit Function
    End If
    If doc.Bookmarks.Exists("COTIZACION") Then
        SeccionCotizacion = doc.Bookmarks("COTIZACION").Range.Sections(1).Index
        If SeccionCotizacion >= 1 Then Exit Function
    End If
PorDefecto:
    If doc.Sections.Count >= 2 Then
        SeccionCotizacion = 2
    Else
        SeccionCotizacion = 1
    End If
End Function


Private Function NombreArchivo(ByVal doc As Document) As String
    ' El formato de Fletes Tauro no lleva folio ni razon social, asi que el
    ' archivo se nombra por fecha y hora.
    NombreArchivo = SoloNombreValido("Cotizacion_" & Format$(Now, "yyyymmdd_hhnn"))
End Function


Private Function SoloNombreValido(ByVal s As String) As String
    Dim i As Long, ch As String, out As String
    s = SinAcentos(s)
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If InStr("\/:*?""<>|.,", ch) > 0 Then
            ch = ""
        ElseIf ch = " " Then
            ch = "_"
        End If
        out = out & ch
    Next i
    Do While InStr(out, "__") > 0
        out = Replace(out, "__", "_")
    Loop
    SoloNombreValido = out
End Function


Private Function CarpetaDestino(ByVal doc As Document) As String
    Dim p As String
    p = doc.Path
    If Len(p) = 0 Then p = Environ$("USERPROFILE") & "\Documents"
    If Right$(p, 1) <> "\" Then p = p & "\"
    CarpetaDestino = p
End Function


' ==========================================================================
'  5. NUEVA COTIZACION
' ==========================================================================
Public Sub NuevaCotizacion()
    Dim doc As Document, panel As Table, i As Long, cc As ContentControl

    If MsgBox("Se van a desmarcar todos los conceptos y a borrar los " & _
              "importes calculados." & vbCrLf & vbCrLf & "Continuar?", _
              vbQuestion + vbOKCancel, "Cotizador Fletes Tauro") <> vbOK Then Exit Sub

    Set doc = ActiveDocument
    Application.ScreenUpdating = False

    Set panel = TablaPorTitulo(doc, T_PANEL)
    If Not panel Is Nothing Then
        For i = 2 To panel.Rows.Count
            Set cc = PrimerControl(panel.Cell(i, 1))
            If Not cc Is Nothing Then
                If cc.Type = wdContentControlCheckBox Then cc.Checked = False
            End If
            EscribirCelda panel, i, 5, ""
        Next i
    End If

    Application.ScreenUpdating = True
    MsgBox "Listo. Captura las cifras de la mercancia, marca los conceptos " & _
           "y ejecuta GenerarCotizacion (Ctrl+Shift+G).", vbInformation, _
           "Cotizador Fletes Tauro"
End Sub


' ==========================================================================
'  6. ATAJOS DE TECLADO
' ==========================================================================
Public Sub RegistrarAtajos()
    On Error Resume Next
    CustomizationContext = ActiveDocument
    KeyBindings.Add KeyCode:=BuildKeyCode(wdKeyControl, wdKeyShift, wdKeyG), _
                    KeyCategory:=wdKeyCategoryMacro, Command:="GenerarCotizacion"
    KeyBindings.Add KeyCode:=BuildKeyCode(wdKeyControl, wdKeyShift, wdKeyP), _
                    KeyCategory:=wdKeyCategoryMacro, Command:="ExportarCotizacionPDF"
End Sub


' ==========================================================================
'  7. UTILERIAS
' ==========================================================================
Private Function TablaPorTitulo(ByVal doc As Document, ByVal titulo As String) As Table
    Dim t As Table
    On Error Resume Next
    For Each t In doc.Tables
        If StrComp(t.Title, titulo, vbTextCompare) = 0 Then
            Set TablaPorTitulo = t
            Exit Function
        End If
    Next t
End Function


Private Function CeldaTexto(ByVal t As Table, ByVal f As Long, ByVal c As Long) As String
    Dim s As String
    On Error Resume Next
    s = t.Cell(f, c).Range.Text
    s = Replace(s, Chr(13), " ")
    s = Replace(s, Chr(7), "")
    s = Replace(s, Chr(11), " ")
    Do While InStr(s, "  ") > 0
        s = Replace(s, "  ", " ")
    Loop
    CeldaTexto = Trim$(s)
End Function


Private Sub EscribirCelda(ByVal t As Table, ByVal f As Long, ByVal c As Long, _
                          ByVal s As String)
    Dim cc As ContentControl
    On Error Resume Next
    Set cc = PrimerControl(t.Cell(f, c))
    If cc Is Nothing Then
        t.Cell(f, c).Range.Text = s
    Else
        cc.Range.Text = s
    End If
End Sub


Private Function PrimerControl(ByVal c As Cell) As ContentControl
    On Error Resume Next
    If c.Range.ContentControls.Count > 0 Then
        Set PrimerControl = c.Range.ContentControls(1)
    End If
End Function


Private Function FilaMarcada(ByVal t As Table, ByVal f As Long) As Boolean
    Dim cc As ContentControl
    On Error Resume Next
    For Each cc In t.Cell(f, 1).Range.ContentControls
        If cc.Type = wdContentControlCheckBox Then
            FilaMarcada = cc.Checked
            Exit Function
        End If
    Next cc
    ' Sin control de contenido: se acepta el simbolo de casilla marcada.
    FilaMarcada = (InStr(CeldaTexto(t, f, 1), ChrW(9746)) > 0) Or _
                  (InStr(CeldaTexto(t, f, 1), ChrW(9745)) > 0) Or _
                  (InStr(UCase$(CeldaTexto(t, f, 1)), "X") > 0)
End Function


Private Function TextoControl(ByVal doc As Document, ByVal etiqueta As String) As String
    Dim ccs As ContentControls
    On Error Resume Next
    Set ccs = doc.SelectContentControlsByTag(etiqueta)
    If ccs Is Nothing Then Exit Function
    If ccs.Count > 0 Then TextoControl = Trim$(Replace(ccs(1).Range.Text, Chr(13), ""))
End Function


Private Sub CopiarControl(ByVal doc As Document, ByVal origen As String, _
                          ByVal destino As String)
    Dim v As String, ccs As ContentControls, i As Long
    On Error Resume Next
    v = TextoControl(doc, origen)
    If Len(v) = 0 Then Exit Sub
    Set ccs = doc.SelectContentControlsByTag(destino)
    If ccs Is Nothing Then Exit Sub
    For i = 1 To ccs.Count
        ccs(i).Range.Text = v
    Next i
End Sub


Private Sub LimpiarControl(ByVal doc As Document, ByVal etiqueta As String, _
                           ByVal valor As String)
    Dim ccs As ContentControls, i As Long
    On Error Resume Next
    Set ccs = doc.SelectContentControlsByTag(etiqueta)
    If ccs Is Nothing Then Exit Sub
    For i = 1 To ccs.Count
        ccs(i).Range.Text = valor
    Next i
End Sub


' Convierte a numero un texto como "$ 1,450.00", "2,000" o "1.20".
' Funciona igual si Windows usa la coma como separador decimal.
Private Function ANumero(ByVal s As String) As Double
    Dim i As Long, ch As String, out As String, dec As String
    Dim pPunto As Long, pComa As Long, cola As Long

    pPunto = InStrRev(s, ".")
    pComa = InStrRev(s, ",")

    If pPunto > 0 And pComa > 0 Then
        ' Con ambos separadores, el ultimo es el decimal.
        If pPunto > pComa Then dec = "." Else dec = ","
    ElseIf pPunto > 0 Or pComa > 0 Then
        ' Con uno solo: si deja exactamente tres digitos a la derecha es
        ' separador de miles (2,000 / 2.000), en otro caso es decimal.
        If pPunto > 0 Then dec = "." Else dec = ","
        cola = Len(s) - IIf(pPunto > 0, pPunto, pComa)
        If cola = 3 And InStr(s, dec) = InStrRev(s, dec) Then
            If SoloDigitos(Right$(s, 3)) Then dec = Chr$(1)   ' ninguno
        End If
    Else
        dec = "."
    End If

    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch >= "0" And ch <= "9" Then
            out = out & ch
        ElseIf ch = dec Then
            out = out & "."
        End If
    Next i

    If Len(out) = 0 Then
        ANumero = 0
    Else
        ANumero = Val(out)
    End If
End Function


Private Function SoloDigitos(ByVal s As String) As Boolean
    Dim i As Long, ch As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch < "0" Or ch > "9" Then Exit Function
    Next i
    SoloDigitos = (Len(s) > 0)
End Function


Private Function Moneda(ByVal v As Double) As String
    Moneda = "$ " & Format$(v, "#,##0.00")
End Function


Private Function Redondear(ByVal v As Double) As Double
    Redondear = Int(v * 100# + 0.5) / 100#
End Function


Private Function Igual(ByVal a As String, ByVal b As String) As Boolean
    Igual = (StrComp(SinAcentos(Trim$(a)), SinAcentos(Trim$(b)), vbTextCompare) = 0)
End Function


Private Function SinAcentos(ByVal s As String) As String
    Const CON As String = "áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑ"
    Const SIN As String = "aeiouAEIOUaeiouAEIOUaeiouAEIOUnN"
    Dim i As Long, p As Long, ch As String, out As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        p = InStr(CON, ch)
        If p > 0 Then ch = Mid$(SIN, p, 1)
        out = out & ch
    Next i
    SinAcentos = out
End Function


' ==========================================================================
'  8. FORMATO DE LA TABLA DEL CLIENTE
' ==========================================================================
Private Sub FormatoFilaConcepto(ByVal f As Row, ByVal alterna As Boolean)
    Dim c As Cell
    f.HeightRule = wdRowHeightAtLeast
    f.Height = 28
    f.AllowBreakAcrossPages = False
    For Each c In f.Cells
        c.Shading.Texture = wdTextureNone
        c.Shading.ForegroundPatternColor = wdColorAutomatic
        If alterna Then
            c.Shading.BackgroundPatternColor = C_FONDO
        Else
            c.Shading.BackgroundPatternColor = C_BLANCO
        End If
        c.VerticalAlignment = wdCellAlignVerticalCenter
        c.TopPadding = 6.5
        c.BottomPadding = 6.5
        c.LeftPadding = 11
        c.RightPadding = 11
        c.Borders(wdBorderTop).LineStyle = wdLineStyleNone
        c.Borders(wdBorderLeft).LineStyle = wdLineStyleNone
        c.Borders(wdBorderRight).LineStyle = wdLineStyleNone
        With c.Borders(wdBorderBottom)
            .LineStyle = wdLineStyleSingle
            .LineWidth = wdLineWidth050pt
            .Color = C_LINEA
        End With
        With c.Range.ParagraphFormat
            .SpaceBefore = 0
            .SpaceAfter = 0
            .LineSpacingRule = wdLineSpaceSingle
            .LeftIndent = 0
            .RightIndent = 0
        End With
    Next c

    With f.Cells(1).Range
        .ParagraphFormat.Alignment = wdAlignParagraphLeft
        .Font.Name = F_TEXTO
        .Font.Size = 10
        .Font.Bold = False
        .Font.Italic = False
        .Font.AllCaps = False
        .Font.Spacing = 0
        .Font.Color = C_GRAFITO
    End With
    With f.Cells(2).Range
        .ParagraphFormat.Alignment = wdAlignParagraphRight
        .Font.Name = F_FUERTE
        .Font.Size = 10
        .Font.Bold = True
        .Font.Italic = False
        .Font.AllCaps = False
        .Font.Spacing = 0
        .Font.Color = C_NAVY
    End With
End Sub


Private Sub AgregarFilaResumen(ByVal t As Table, ByVal etiqueta As String, _
                               ByVal valor As Double)
    Dim f As Row, c As Cell
    Set f = t.Rows.Add(BeforeRow:=t.Rows(t.Rows.Count))
    f.HeightRule = wdRowHeightAtLeast
    f.Height = 24
    f.AllowBreakAcrossPages = False
    For Each c In f.Cells
        c.Shading.Texture = wdTextureNone
        c.Shading.BackgroundPatternColor = C_BLANCO
        c.VerticalAlignment = wdCellAlignVerticalCenter
        c.TopPadding = 5.5
        c.BottomPadding = 5.5
        c.LeftPadding = 11
        c.RightPadding = 11
        c.Borders(wdBorderTop).LineStyle = wdLineStyleNone
        c.Borders(wdBorderLeft).LineStyle = wdLineStyleNone
        c.Borders(wdBorderRight).LineStyle = wdLineStyleNone
        With c.Borders(wdBorderBottom)
            .LineStyle = wdLineStyleSingle
            .LineWidth = wdLineWidth050pt
            .Color = C_LINEA
        End With
        With c.Range.ParagraphFormat
            .SpaceBefore = 0
            .SpaceAfter = 0
            .Alignment = wdAlignParagraphRight
            .LineSpacingRule = wdLineSpaceSingle
        End With
    Next c
    With f.Cells(1).Range
        .Font.Name = F_TEXTO
        .Font.Size = 9
        .Font.Bold = False
        .Font.Color = C_GRIS
        .Font.AllCaps = True
        .Font.Spacing = 1
    End With
    With f.Cells(2).Range
        .Font.Name = F_FUERTE
        .Font.Size = 9.5
        .Font.Bold = True
        .Font.AllCaps = False
        .Font.Spacing = 0
        .Font.Color = C_GRAFITO
    End With
    f.Cells(1).Range.Text = etiqueta
    f.Cells(2).Range.Text = Moneda(valor)
End Sub


Private Sub FormatoFilaTotal(ByVal f As Row)
    Dim c As Cell
    f.HeightRule = wdRowHeightAtLeast
    f.Height = 40
    f.AllowBreakAcrossPages = False
    For Each c In f.Cells
        c.Shading.Texture = wdTextureNone
        c.Shading.BackgroundPatternColor = C_NAVY
        c.VerticalAlignment = wdCellAlignVerticalCenter
        c.TopPadding = 9
        c.BottomPadding = 9
        c.LeftPadding = 11
        c.RightPadding = 11
        c.Borders(wdBorderLeft).LineStyle = wdLineStyleNone
        c.Borders(wdBorderRight).LineStyle = wdLineStyleNone
        c.Borders(wdBorderBottom).LineStyle = wdLineStyleNone
        With c.Borders(wdBorderTop)
            .LineStyle = wdLineStyleSingle
            .LineWidth = wdLineWidth150pt
            .Color = C_CHAMP
        End With
        With c.Range.ParagraphFormat
            .SpaceBefore = 0
            .SpaceAfter = 0
            .LineSpacingRule = wdLineSpaceSingle
        End With
    Next c
    With f.Cells(1).Range
        .ParagraphFormat.Alignment = wdAlignParagraphLeft
        .Font.Name = F_FUERTE
        .Font.Size = 11
        .Font.Bold = True
        .Font.AllCaps = True
        .Font.Spacing = 4.5
        .Font.Color = C_BLANCO
    End With
    With f.Cells(2).Range
        .ParagraphFormat.Alignment = wdAlignParagraphRight
        .Font.Name = F_FUERTE
        .Font.Size = 14
        .Font.Bold = True
        .Font.AllCaps = False
        .Font.Spacing = 0
        .Font.Color = C_BLANCO
    End With
End Sub
