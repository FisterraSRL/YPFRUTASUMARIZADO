# Importador YPF en ruta sumarizado

Portal de revisión de la hoja FINAL. Agrupa los consumos por razón social y genera una liquidación YPF-R por cada razón social seleccionada. El envío requiere revisar y confirmar el lote.

## Uso local

Instalar dependencias con npm install. Copiar .env.example a .env.local y completar FINNEGANS_CLIENT_ID y FINNEGANS_CLIENT_SECRET. FINNEGANS_ENV identifica la publicación como DESA o TEST; las credenciales se configuran por separado en cada proyecto de Vercel y nunca se incluyen en GitHub. Ejecutar npm run dev.

## Reglas de liquidación

- Agrupación por razón social, ignorando mayúsculas y espacios repetidos. Cada grupo conserva las filas de origen para revisión.
- Importe: suma de la columna física U (A DESCONTAR), incluyendo resultados almacenados de fórmulas. CantidadWorkflow = 1 y Precio = suma de U, con signo positivo y hasta 6 decimales.
- Descripción: Liquidacion [Razón social] Periodo: MM/AAAA. Todos los grupos usan el mes y año de la primera fila del archivo, aun cuando existan fechas de otros meses.
- Fecha y fecha base de vencimiento: último día del mes del período de la liquidación. Comprobante: LIQ-AAAAMM-[SAP]. Identificación externa: período, SAP y hash de los consumos agrupados.
- Proveedor: N° SAP. Si una razón social tiene distintos códigos SAP o filas inválidas, todo el grupo queda observado para evitar liquidaciones parciales.
- Producto fijo 62, condición de pago 15. Dimensiones DIMCTC/1160 y SUCDES elegida en la grilla, al 100 % del total U redondeado a 4 decimales.
- Si el grupo tiene distintas sucursales, se debe elegir una para la liquidación. Los duplicados exactos se observan y bloquean el grupo.

El archivo se procesa en el navegador y solo se envían las liquidaciones confirmadas. Las credenciales residen en el servidor. La API rechaza el formato anterior de recepciones individuales; luego de actualizar el portal se debe volver a cargar el Excel.

## Validación

Pruebas de agrupación y conciliación de U, JSON, selección y envío con respuestas simuladas. No se crean documentos reales durante las pruebas.
