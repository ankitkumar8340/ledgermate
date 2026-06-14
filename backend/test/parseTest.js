// CSV Parsing Test Script
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { processCSVData } from '../utils/importer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '../../../expenses_export.csv');

try {
  console.log('Reading CSV from path:', csvPath);
  const csvText = fs.readFileSync(csvPath, 'utf8');
  console.log('Processing CSV data...');
  const stagedItems = processCSVData(csvText);
  
  console.log(`Parsed ${stagedItems.length} items from CSV.`);
  
  let totalAnomalies = 0;
  let totalWarnings = 0;
  
  stagedItems.forEach(item => {
    totalAnomalies += item.anomalies.length;
    totalWarnings += item.warnings.length;
    
    if (item.anomalies.length > 0 || item.warnings.length > 0) {
      console.log(`\nRow ${item.csvRowIndex}: ${item.description} (Date: ${item.date})`);
      item.anomalies.forEach(a => console.log(`  [CRITICAL ANOMALY] ${a.type}: ${a.message}`));
      item.warnings.forEach(w => console.log(`  [WARNING] ${w.type}: ${w.message}`));
    }
  });
  
  console.log('\n--- Parse Summary ---');
  console.log(`Total Staged Rows: ${stagedItems.length}`);
  console.log(`Total Critical Anomalies: ${totalAnomalies}`);
  console.log(`Total Warnings: ${totalWarnings}`);
  
} catch (err) {
  console.error('Error running parser test:', err.message);
}
