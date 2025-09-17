const form = document.getElementById('productForm');
const productTable = document.getElementById('productTable');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');

let products = JSON.parse(localStorage.getItem('products')) || [];

// Render Table
function renderTable() {
    productTable.innerHTML = '';
    products.forEach((product, index) => {
        const closingStock = product.openingStock - product.quantitySold;
        const profitLoss = product.quantitySold * product.price;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input class="table-input" type="text" value="${product.productName}"></td>
            <td><input class="table-input" type="number" min="0" value="${product.openingStock}"></td>
            <td><input class="table-input" type="number" min="0" value="${product.quantitySold}"></td>
            <td>${closingStock}</td>
            <td><input class="table-input" type="number" min="0" step="0.01" value="${product.price.toFixed(2)}"></td>
            <td>${profitLoss.toFixed(2)}</td>
            <td><button class="delete-btn">Delete</button></td>
        `;
        productTable.appendChild(row);

        // Inline change handling
        const inputs = row.querySelectorAll('.table-input');
        inputs.forEach((input, i) => {
            input.addEventListener('input', () => {
                const newProductName = row.cells[0].querySelector('input').value.trim();
                const newOpeningStock = parseInt(row.cells[1].querySelector('input').value) || 0;
                const newQuantitySold = parseInt(row.cells[2].querySelector('input').value) || 0;
                const newPrice = parseFloat(row.cells[4].querySelector('input').value) || 0;

                if(newQuantitySold > newOpeningStock){
                    row.cells[2].querySelector('input').value = products[index].quantitySold;
                    alert("Quantity Sold cannot exceed Opening Stock!");
                    return;
                }

                products[index] = {
                    productName: newProductName,
                    openingStock: newOpeningStock,
                    quantitySold: newQuantitySold,
                    price: newPrice
                };
                localStorage.setItem('products', JSON.stringify(products));
                renderTable(); // Re-render to update closing stock and profit
            });
        });

        // Delete functionality
        const deleteBtn = row.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            if(confirm("Are you sure you want to delete this product?")) {
                products.splice(index, 1);
                localStorage.setItem('products', JSON.stringify(products));
                renderTable();
            }
        });
    });
}

// Form Submission
form.addEventListener('submit', function(e) {
    e.preventDefault();
    const productName = document.getElementById('productName').value.trim();
    const openingStock = parseInt(document.getElementById('openingStock').value) || 0;
    const price = parseFloat(document.getElementById('price').value) || 0;
    const quantitySold = parseInt(document.getElementById('quantitySold').value) || 0;

    if(quantitySold > openingStock){
        alert("Quantity Sold cannot exceed Opening Stock!");
        return;
    }

    const product = { productName, openingStock, quantitySold, price };
    products.push(product);
    localStorage.setItem('products', JSON.stringify(products));

    form.reset();
    renderTable();
});

renderTable();

// Download PDF
downloadPdfBtn.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("StockPro - End of Shift Report", 14, 20);

    doc.setFontSize(12);
    const headers = [["Product Name", "Opening Stock", "Quantity Sold", "Closing Stock", "Price", "Profit/Loss"]];
    const data = products.map(p => [
        p.productName,
        p.openingStock,
        p.quantitySold,
        p.openingStock - p.quantitySold,
        p.price.toFixed(2),
        (p.quantitySold * p.price).toFixed(2)
    ]);

    doc.autoTable({
        head: headers,
        body: data,
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [26, 35, 126] },
        styles: { fontSize: 10 }
    });

    const totalOpeningStock = products.reduce((sum, p) => sum + p.openingStock, 0);
    const totalSold = products.reduce((sum, p) => sum + p.quantitySold, 0);
    const totalClosingStock = products.reduce((sum, p) => sum + (p.openingStock - p.quantitySold), 0);
    const totalRevenue = products.reduce((sum, p) => sum + (p.quantitySold * p.price), 0);

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text("Summary", 14, finalY);
    doc.setFontSize(12);
    doc.text(`Total Opening Stock: ${totalOpeningStock}`, 14, finalY + 8);
    doc.text(`Total Quantity Sold: ${totalSold}`, 14, finalY + 16);
    doc.text(`Total Closing Stock: ${totalClosingStock}`, 14, finalY + 24);
    doc.text(`Total Revenue: $${totalRevenue.toFixed(2)}`, 14, finalY + 32);

    doc.save('StockPro_EndOfShift_Report.pdf');
});
