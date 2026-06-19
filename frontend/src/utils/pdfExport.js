import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
  inferReportTitleFromFileName,
} from './reportPdf';

export const exportToPDF = async (elementId, fileName = 'report.pdf', options = {}) => {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#f9fafb'
  });

  const grayscaleCanvas = document.createElement('canvas');
  grayscaleCanvas.width = canvas.width;
  grayscaleCanvas.height = canvas.height;
  const grayscaleContext = grayscaleCanvas.getContext('2d');
  grayscaleContext.drawImage(canvas, 0, 0);
  const imageData = grayscaleContext.getImageData(0, 0, grayscaleCanvas.width, grayscaleCanvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(
      pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114,
    );
    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
  }
  grayscaleContext.putImageData(imageData, 0, 0);

  const imgData = grayscaleCanvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const contentMargin = options.contentMargin ?? 8;
  const imgWidth = pdfWidth - contentMargin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const title = options.title || inferReportTitleFromFileName(fileName);
  const subtitle = options.subtitle || `Generated report snapshot`;
  const headerBottomY = drawBrandedReportHeader(pdf, { title, subtitle, marginLeft: 8, marginRight: 8 });
  const headerHeight = headerBottomY - 2;
  const bodyHeight = pdfHeight - headerHeight - 18;

  let heightLeft = imgHeight;
  let position = headerHeight;

  pdf.setDrawColor(209, 213, 219);
  pdf.setLineWidth(0.3);
  pdf.rect(contentMargin, position - 1.5, imgWidth, bodyHeight + 3);
  pdf.addImage(imgData, 'PNG', contentMargin, position, imgWidth, imgHeight);
  heightLeft -= bodyHeight;

  while (heightLeft > 0) {
    pdf.addPage();
    drawBrandedReportHeader(pdf, { title, subtitle, marginLeft: 8, marginRight: 8 });
    position = headerHeight + heightLeft - imgHeight;
    pdf.setDrawColor(209, 213, 219);
    pdf.setLineWidth(0.3);
    pdf.rect(contentMargin, headerHeight - 1.5, imgWidth, bodyHeight + 3);
    pdf.addImage(imgData, 'PNG', contentMargin, position, imgWidth, imgHeight);
    heightLeft -= bodyHeight;
  }

  addBrandedReportFooters(pdf, { marginLeft: 8, marginRight: 8 });
  pdf.save(fileName);
};
