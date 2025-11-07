import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Training, TrainingType, Serie, FartlekBlock, PotenciaBlock, DayOfWeek, FartlekSeriesData, PotenciaSeriesData } from './types';
import { Chart, registerables } from 'chart.js';
import type { Chart as ChartType } from 'chart.js';

Chart.register(...registerables);

// --- UTILITY FUNCTIONS ---
const formatTime = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const calculateTotalDuration = (training: Training): number => {
    switch (training.type) {
        case 'Series':
            return (training.data as Serie[]).reduce((sum, s) => sum + s.time, 0);
        case 'Fartlek':
        case 'Potencia Aeróbica':
            return (training.data as (FartlekBlock | PotenciaBlock)[]).reduce((sum, b) => sum + (b.time * 60), 0);
        case 'Fartlek más Series':
            const fsData = training.data as FartlekSeriesData;
            const fartlekTime = fsData.fartlekBlocks.reduce((sum, b) => sum + (b.time * 60), 0);
            const seriesTime = fsData.series.reduce((sum, s) => sum + s.time, 0);
            return fartlekTime + seriesTime;
        case 'Potencia Aeróbica más Series':
            const psData = training.data as PotenciaSeriesData;
            const potenciaTime = psData.potenciaBlocks.reduce((sum, b) => sum + (b.time * 60), 0);
            const seriesTime2 = psData.series.reduce((sum, s) => sum + s.time, 0);
            return potenciaTime + seriesTime2;
        default:
            return 0;
    }
};

const generateReportHtml = (training: Training): string => {
    const renderSeriesTable = (series: Serie[]) => {
        const rows = series.map((s, i) => {
            const pacePer100 = s.distance > 0 ? (s.time / s.distance) * 100 : 0;
            const est800 = pacePer100 * 8;
            return `<tr>
                <td>${i + 1}</td>
                <td>${s.distance}m</td>
                <td>${formatTime(s.time)}</td>
                <td>${formatTime(s.recovery)}</td>
                <td>${pacePer100.toFixed(2)}s</td>
                <td>${formatTime(est800)}</td>
                <td>${s.sensations || '-'}</td>
            </tr>`;
        }).join('');
        return `<h3>Detalle de Series</h3>
            <table>
                <thead><tr><th>#</th><th>Distancia</th><th>Tiempo</th><th>Rec.</th><th>Ritmo/100m</th><th>Est. 800m</th><th>Sensaciones</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    };

    const renderAerobicTable = (blocks: (FartlekBlock | PotenciaBlock)[], title: string) => {
        const rows = blocks.map((b, i) => {
            const pacePerKm = b.distance > 0 ? formatTime((b.time * 60) / (b.distance / 1000)) : 'N/A';
            return `<tr>
                <td>${i + 1}</td>
                <td>${b.time} min</td>
                <td>${b.distance}m</td>
                <td>${pacePerKm}</td>
                <td>${b.sensations || '-'}</td>
            </tr>`;
        }).join('');
        return `<h3>${title}</h3>
            <table>
                <thead><tr><th>#</th><th>Tiempo</th><th>Distancia</th><th>Ritmo (min/km)</th><th>Sensaciones</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    };

    let tablesHtml = '';
    switch (training.type) {
        case 'Series':
            tablesHtml = renderSeriesTable(training.data as Serie[]);
            break;
        case 'Fartlek':
            tablesHtml = renderAerobicTable(training.data as FartlekBlock[], 'Detalle de Fartlek');
            break;
        case 'Potencia Aeróbica':
            tablesHtml = renderAerobicTable(training.data as PotenciaBlock[], 'Detalle Potencia Aeróbica');
            break;
        case 'Fartlek más Series':
            const fsData = training.data as FartlekSeriesData;
            tablesHtml = renderAerobicTable(fsData.fartlekBlocks, 'Detalle de Fartlek') + renderSeriesTable(fsData.series);
            break;
        case 'Potencia Aeróbica más Series':
            const psData = training.data as PotenciaSeriesData;
            tablesHtml = renderAerobicTable(psData.potenciaBlocks, 'Detalle Potencia Aeróbica') + renderSeriesTable(psData.series);
            break;
    }
    
    // Using more robust styles for consistent PDF generation across devices.
    const printStyles = `
        body { 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            color: #000;
            font-size: 12pt;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #aaa;
            padding-bottom: 10px;
            margin-bottom: 30px;
            page-break-inside: avoid;
        }
        h1 { font-size: 24pt; margin: 0; color: #000; }
        h2 { font-size: 18pt; margin: 10px 0; color: #000; font-weight: normal; }
        h3 { 
            font-size: 14pt; 
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-top: 30px;
            margin-bottom: 15px;
            color: #000;
        }
        p { margin: 5px 0; color: #000; }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 1em; 
            page-break-inside: auto;
        }
        tr {
            page-break-inside: avoid;
        }
        th, td { 
            border: 1px solid #999; 
            padding: 8px; 
            text-align: left; 
            font-size: 10pt;
            color: #000;
        }
        th { 
            background-color: #e8e8e8; 
            font-weight: bold; 
        }
    `;

    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Informe de Entrenamiento - ${training.athleteName}</title>
            <style>${printStyles}</style>
        </head>
        <body>
            <div class="header">
                <h1>Informe de Entrenamiento</h1>
                <h2>${training.athleteName}</h2>
                <p><strong>${training.day} - ${training.type}</strong></p>
                <p><small>${formatDate(training.date)}</small></p>
            </div>
            ${tablesHtml}
        </body>
        </html>`;
};


// --- ICONS ---
const Icon = ({ path, className }: { path: string, className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-6 h-6 ${className}`}>
        <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
);
const ChartBarIcon = () => <Icon path="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25C3.504 21 3 20.496 3 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125-1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />;
const RunnerIcon = () => <Icon path="M12.375 3.375a1.5 1.5 0 011.5 1.5v2.25h1.5a1.5 1.5 0 011.5 1.5v1.5a1.5 1.5 0 01-1.5 1.5h-1.5v2.25a1.5 1.5 0 01-1.5 1.5h-1.5a1.5 1.5 0 01-1.5-1.5v-1.5a1.5 1.5 0 011.5-1.5h1.5v-1.5h-1.5a1.5 1.5 0 01-1.5-1.5v-2.25a1.5 1.5 0 011.5-1.5h1.5z" />;
const MuscleIcon = () => <Icon path="M10.5 6A2.25 2.25 0 008.25 8.25V14.25a2.25 2.25 0 002.25 2.25h3a2.25 2.25 0 002.25-2.25V8.25a2.25 2.25 0 00-2.25-2.25h-3z" />;
const UsersIcon = () => <Icon path="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-1.063 3 3 0 10-5.513-5.513 3 3 0 00-1.232 2.625 3 3 0 003 3zM9 11.25a3 3 0 100-6 3 3 0 000 6z" />;
const TrashIcon = () => <Icon path="M16.5 4.478v.227a48.816 48.816 0 01-8.832 0V4.478a.75.75 0 01.75-.75h7.332a.75.75 0 01.75.75zM17.25 5.25v-.75A2.25 2.25 0 0015 2.25H9A2.25 2.25 0 006.75 4.5v.75m10.5 0v11.25A2.25 2.25 0 0115 18.75H9a2.25 2.25 0 01-2.25-2.25V5.25" />;
const DuplicateIcon = () => <Icon path="M11.25 4.5A2.25 2.25 0 009 6.75v10.5A2.25 2.25 0 0011.25 19.5h3.75a2.25 2.25 0 002.25-2.25v-10.5A2.25 2.25 0 0015 4.5h-3.75zM11.25 6h3.75a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-3.75a.75.75 0 01-.75-.75v-10.5a.75.75 0 01.75-.75z" />;
const EyeIcon = () => <Icon path="M12 15a3 3 0 100-6 3 3 0 000 6z" />;

// --- HOOKS ---
const useLocalStorage = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error(error);
            return initialValue;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(storedValue));
        } catch (error) {
            console.error(error);
        }
    }, [key, storedValue]);

    return [storedValue, setStoredValue];
};

// --- CHILD COMPONENTS ---

const ResultsDisplay = ({ training, onExportCsv, onDelete }: { training: Training | null, onExportCsv: (training: Training) => void, onDelete: (id: string) => void }) => {
    const paceChartRef = React.useRef<HTMLCanvasElement>(null);
    const timeChartRef = React.useRef<HTMLCanvasElement>(null);
    const chartInstances = React.useRef<{ pace?: ChartType, time?: ChartType }>({});

    const seriesData = useMemo(() => {
        if (!training) return [];
        if (training.type === 'Series') return training.data as Serie[];
        if (training.type === 'Fartlek más Series') return (training.data as FartlekSeriesData).series;
        if (training.type === 'Potencia Aeróbica más Series') return (training.data as PotenciaSeriesData).series;
        return [];
    }, [training]);

    useEffect(() => {
        if (chartInstances.current.pace) chartInstances.current.pace.destroy();
        if (chartInstances.current.time) chartInstances.current.time.destroy();

        if (seriesData.length > 0 && paceChartRef.current && timeChartRef.current) {
            const labels = seriesData.map((s, i) => `${i + 1}º (${s.distance}m)`);
            const paceData = seriesData.map(s => (s.time / s.distance) * 100);
            const timeData = seriesData.map(s => s.time);

            chartInstances.current.pace = new Chart(paceChartRef.current, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Ritmo por 100m (segundos)',
                        data: paceData,
                        backgroundColor: 'rgb(14, 165, 233)',
                        borderColor: 'rgb(14, 165, 233)',
                        borderWidth: 1
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, animation: { duration: 0 } }
            });

            chartInstances.current.time = new Chart(timeChartRef.current, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Tiempo por Serie (segundos)',
                        data: timeData,
                        fill: false,
                        borderColor: 'rgb(245, 158, 11)',
                        tension: 0.1
                    }]
                },
                 options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, animation: { duration: 0 } }
            });
        }

        return () => {
            if (chartInstances.current.pace) chartInstances.current.pace.destroy();
            if (chartInstances.current.time) chartInstances.current.time.destroy();
        }
    }, [seriesData]);
    
    const handlePrint = useCallback(() => {
        if (!training) return;
        
        const reportHtml = generateReportHtml(training);
    
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.open();
            printWindow.document.write(reportHtml);
            printWindow.document.close();
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        } else {
            alert('Por favor, habilita las ventanas emergentes para poder imprimir el informe.');
        }
    }, [training]);

    if (!training) {
        return <div className="text-center p-8 bg-white rounded-lg shadow-md">No hay datos de entrenamiento todavía. Registra uno nuevo para ver los resultados.</div>;
    }

    const renderSeriesTable = (series: Serie[]) => (
        <div className="overflow-x-auto">
            <table className="w-full text-left mt-2">
                <thead className="bg-slate-100">
                    <tr>
                        <th className="p-2">Serie</th>
                        <th className="p-2">Distancia</th>
                        <th className="p-2">Tiempo</th>
                        <th className="p-2">Rec.</th>
                        <th className="p-2">Ritmo/100m</th>
                        <th className="p-2">Est. 800m</th>
                        <th className="p-2">Sensaciones</th>
                    </tr>
                </thead>
                <tbody>
                    {series.map((s, i) => {
                        const pacePer100 = (s.time / s.distance) * 100;
                        const est800 = pacePer100 * 8;
                        return (
                            <tr key={i} className="border-b">
                                <td className="p-2 font-semibold">{i + 1}</td>
                                <td className="p-2">{s.distance}m</td>
                                <td className="p-2">{formatTime(s.time)}</td>
                                <td className="p-2">{formatTime(s.recovery)}</td>
                                <td className="p-2">{pacePer100.toFixed(2)}s</td>
                                <td className="p-2">{formatTime(est800)}</td>
                                <td className="p-2 text-sm italic">{s.sensations || '-'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    const renderFartlekTable = (blocks: FartlekBlock[]) => (
        <div className="overflow-x-auto">
            <table className="w-full text-left mt-2">
                <thead className="bg-slate-100">
                    <tr>
                        <th className="p-2">Bloque</th>
                        <th className="p-2">Tiempo</th>
                        <th className="p-2">Distancia</th>
                        <th className="p-2">Ritmo (min/km)</th>
                        <th className="p-2">Sensaciones</th>
                    </tr>
                </thead>
                <tbody>
                    {blocks.map((b, i) => {
                        const pacePerKm = b.distance > 0 ? formatTime((b.time * 60) / (b.distance / 1000)) : 'N/A';
                        return (
                            <tr key={i} className="border-b">
                                <td className="p-2 font-semibold">{i + 1}</td>
                                <td className="p-2">{b.time} min</td>
                                <td className="p-2">{b.distance}m</td>
                                <td className="p-2">{pacePerKm}</td>
                                <td className="p-2 text-sm italic">{b.sensations || '-'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
    
    const renderPotenciaTable = (blocks: PotenciaBlock[]) => (
         <div className="overflow-x-auto">
            <table className="w-full text-left mt-2">
                <thead className="bg-slate-100">
                    <tr>
                        <th className="p-2">Bloque</th>
                        <th className="p-2">Tiempo</th>
                        <th className="p-2">Distancia</th>
                        <th className="p-2">Ritmo (min/km)</th>
                        <th className="p-2">Sensaciones</th>
                    </tr>
                </thead>
                <tbody>
                    {blocks.map((b, i) => {
                         const pacePerKm = b.distance > 0 ? formatTime((b.time * 60) / (b.distance / 1000)) : 'N/A';
                         return (
                            <tr key={i} className="border-b">
                                <td className="p-2 font-semibold">{i + 1}</td>
                                <td className="p-2">{b.time} min</td>
                                <td className="p-2">{b.distance}m</td>
                                <td className="p-2">{pacePerKm}</td>
                                <td className="p-2 text-sm italic">{b.sensations || '-'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
         <div className="space-y-6 fade-in bg-white p-4 sm:p-6 rounded-lg shadow-md">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                     <h2 className="text-xl sm:text-2xl font-bold text-sky-600">{training.athleteName}</h2>
                     <p className="text-slate-500">{training.day} - {training.type}</p>
                     <p className="text-sm text-slate-400">{formatDate(training.date)}</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
                    <button onClick={() => onDelete(training.id)} className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 min-h-[44px]">Borrar</button>
                    <button onClick={handlePrint} className="bg-sky-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-sky-600 min-h-[44px]">Imprimir / Guardar PDF</button>
                    <button onClick={() => onExportCsv(training)} className="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 min-h-[44px]">Exportar CSV</button>
                </div>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-50 p-3 rounded-lg"><p className="text-xs sm:text-sm text-slate-500">Duración Total</p><p className="text-lg font-bold text-slate-800">{formatTime(calculateTotalDuration(training))}</p></div>
                { (training.type.includes('Series')) && <div className="bg-slate-50 p-3 rounded-lg"><p className="text-xs sm:text-sm text-slate-500">Nº de Series</p><p className="text-lg font-bold text-slate-800">{seriesData.length}</p></div>}
            </div>

            { training.type === 'Series' && <div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle de Series</h3>{renderSeriesTable(seriesData)}</div> }
            { training.type === 'Fartlek' && <div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle de Fartlek</h3>{renderFartlekTable(training.data as FartlekBlock[])}</div>}
            { training.type === 'Potencia Aeróbica' && <div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle Potencia Aeróbica</h3>{renderPotenciaTable(training.data as PotenciaBlock[])}</div>}
            { training.type === 'Fartlek más Series' && <><div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle de Fartlek</h3>{renderFartlekTable((training.data as FartlekSeriesData).fartlekBlocks)}</div><div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle de Series</h3>{renderSeriesTable((training.data as FartlekSeriesData).series)}</div></>}
            { training.type === 'Potencia Aeróbica más Series' && <><div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle Potencia Aeróbica</h3>{renderPotenciaTable((training.data as PotenciaSeriesData).potenciaBlocks)}</div><div className="space-y-2 pt-4 border-t"><h3 className="font-bold text-lg text-slate-700">Detalle de Series</h3>{renderSeriesTable((training.data as PotenciaSeriesData).series)}</div></>}
            
            {seriesData.length > 0 && (
                <div className="pt-4 border-t grid grid-cols-1 lg:grid-cols-2 gap-6 chart-wrapper">
                    <div>
                        <h3 className="font-bold text-lg text-slate-700 mb-2">Gráfico de Ritmo por 100m</h3>
                        <div className="chart-container"><canvas ref={paceChartRef}></canvas></div>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-slate-700 mb-2">Gráfico de Evolución de Tiempo</h3>
                        <div className="chart-container"><canvas ref={timeChartRef}></canvas></div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Modal = ({ isOpen, onClose, children }: { isOpen: boolean, onClose: () => void, children?: React.ReactNode }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 text-2xl font-bold">×</button>
                {children}
            </div>
        </div>
    );
};

const DashboardCard = ({ icon, title, value, color }: { icon: React.ReactNode, title: string, value: string | number, color: string }) => (
    <div className="dashboard-card bg-white p-6 rounded-lg shadow-md flex items-center gap-4">
        <div className={`p-3 rounded-full bg-[${color}]/20 text-[${color}]`}>
            {icon}
        </div>
        <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
);


// --- MAIN APP COMPONENT ---

type SerieWithId = Serie & { tempId: number };
type FartlekBlockWithId = FartlekBlock & { tempId: number };
type PotenciaBlockWithId = PotenciaBlock & { tempId: number };

const App: React.FC = () => {
    const [history, setHistory] = useLocalStorage<Training[]>('athletic_training_history', []);
    const [activeTab, setActiveTab] = useState('new');
    const [modalTrainingId, setModalTrainingId] = useState<string | null>(null);


    // Form State
    const [athleteName, setAthleteName] = useState('');
    const [day, setDay] = useState<DayOfWeek>('Lunes');
    const [type, setType] = useState<TrainingType>('Series');

    const [series, setSeries] = useState<SerieWithId[]>([]);
    const [currentSerie, setCurrentSerie] = useState({ distance: '', timeMin: '', timeSec: '', recMin: '', recSec: '', sensations: '' });
    
    const [fartlekBlocks, setFartlekBlocks] = useState<FartlekBlockWithId[]>([]);
    const [currentFartlek, setCurrentFartlek] = useState({ time: '', distance: '', sensations: '' });

    const [potenciaBlocks, setPotenciaBlocks] = useState<PotenciaBlockWithId[]>([]);
    const [currentPotencia, setCurrentPotencia] = useState({ time: '', distance: '', sensations: '' });
    
    const latestTraining = useMemo(() => {
        return history.length > 0 ? history[history.length - 1] : null;
    }, [history]);

    const dashboardStats = useMemo(() => {
        const totalTrainings = history.length;
        const totalSeries = history.reduce((acc, t) => {
            if (t.type === 'Series') return acc + (t.data as Serie[]).length;
            if (t.type === 'Fartlek más Series') return acc + (t.data as FartlekSeriesData).series.length;
            if (t.type === 'Potencia Aeróbica más Series') return acc + (t.data as PotenciaSeriesData).series.length;
            return acc;
        }, 0);
        const totalPotencia = history.filter(t => t.type.includes('Potencia Aeróbica')).length;
        const activeUsers = new Set(history.map(t => t.athleteName.toLowerCase().trim())).size;
        return { totalTrainings, totalSeries, totalPotencia, activeUsers };
    }, [history]);
    
    const resetForm = useCallback(() => {
        setAthleteName('');
        setDay('Lunes');
        setType('Series');
        setSeries([]);
        setCurrentSerie({ distance: '', timeMin: '', timeSec: '', recMin: '', recSec: '', sensations: '' });
        setFartlekBlocks([]);
        setCurrentFartlek({ time: '', distance: '', sensations: '' });
        setPotenciaBlocks([]);
        setCurrentPotencia({ time: '', distance: '', sensations: '' });
    }, []);

    const handleAddSerie = () => {
        const distance = parseFloat(currentSerie.distance);
        if (isNaN(distance) || distance <= 0) {
            alert('La distancia de la serie debe ser un número positivo.');
            return;
        }

        const timeMin = parseFloat(currentSerie.timeMin) || 0;
        const timeSec = parseFloat(currentSerie.timeSec) || 0;
        const totalTime = timeMin * 60 + timeSec;
        if (totalTime <= 0) {
            alert('El tiempo de la serie debe ser positivo.');
            return;
        }
        
        const recMin = parseFloat(currentSerie.recMin) || 0;
        const recSec = parseFloat(currentSerie.recSec) || 0;
        const totalRecovery = recMin * 60 + recSec;

        setSeries(prevSeries => [...prevSeries, {
            distance: distance,
            time: totalTime,
            recovery: totalRecovery,
            sensations: currentSerie.sensations,
            tempId: Date.now() + Math.random()
        }]);
        setCurrentSerie({ distance: '', timeMin: '', timeSec: '', recMin: '', recSec: '', sensations: '' });
    };

    const handleDuplicateLastSerie = () => {
        setSeries(prevSeries => {
            if (prevSeries.length > 0) {
                const lastSerie = prevSeries[prevSeries.length - 1];
                return [...prevSeries, {...lastSerie, tempId: Date.now() + Math.random()}];
            }
            return prevSeries;
        });
    };

    const handleAddFartlek = () => {
        const time = parseFloat(currentFartlek.time);
        const distance = parseFloat(currentFartlek.distance);

        if (isNaN(time) || time <= 0) {
            alert('El tiempo del bloque Fartlek debe ser un número positivo.');
            return;
        }
        if (isNaN(distance) || distance <= 0) {
            alert('La distancia del bloque Fartlek debe ser un número positivo.');
            return;
        }

        setFartlekBlocks(prevBlocks => [...prevBlocks, {
            time: time,
            distance: distance,
            sensations: currentFartlek.sensations,
            tempId: Date.now() + Math.random()
        }]);
        setCurrentFartlek({ time: '', distance: '', sensations: '' });
    };
    
    const handleAddPotencia = () => {
        const time = parseFloat(currentPotencia.time);
        const distance = parseFloat(currentPotencia.distance);
        
        if (isNaN(time) || time <= 0) {
            alert('El tiempo del bloque de Potencia Aeróbica debe ser un número positivo.');
            return;
        }
        if (isNaN(distance) || distance <= 0) {
            alert('La distancia del bloque de Potencia Aeróbica debe ser un número positivo.');
            return;
        }

        setPotenciaBlocks(prevBlocks => [...prevBlocks, {
            time: time,
            distance: distance,
            sensations: currentPotencia.sensations,
            tempId: Date.now() + Math.random()
        }]);
        setCurrentPotencia({ time: '', distance: '', sensations: '' });
    };

    const handleRegister = () => {
        if (!athleteName.trim()) {
            alert('Por favor, introduce el nombre del atleta.');
            return;
        }

        let trainingData: Training['data'];
        
        const stripId = <T extends {tempId: number}>(arr: T[]): Omit<T, 'tempId'>[] => {
            return arr.map(({ tempId, ...rest }) => rest);
        }

        switch (type) {
            case 'Series':
                if (series.length === 0) {
                    alert('Debes añadir al menos una serie.');
                    return;
                }
                trainingData = stripId<SerieWithId>(series);
                break;
            case 'Fartlek':
                if (fartlekBlocks.length === 0) {
                    alert('Debes añadir al menos un bloque de Fartlek.');
                    return;
                }
                trainingData = stripId<FartlekBlockWithId>(fartlekBlocks);
                break;
            case 'Potencia Aeróbica':
                if (potenciaBlocks.length === 0) {
                    alert('Debes añadir al menos un bloque de Potencia Aeróbica.');
                    return;
                }
                trainingData = stripId<PotenciaBlockWithId>(potenciaBlocks);
                break;
            case 'Fartlek más Series':
                if (fartlekBlocks.length === 0 || series.length === 0) {
                    alert('Debes añadir al menos un bloque de Fartlek Y una serie.');
                    return;
                }
                trainingData = { fartlekBlocks: stripId<FartlekBlockWithId>(fartlekBlocks), series: stripId<SerieWithId>(series) };
                break;
            case 'Potencia Aeróbica más Series':
                if (potenciaBlocks.length === 0 || series.length === 0) {
                    alert('Debes añadir al menos un bloque de Potencia Aeróbica Y una serie.');
                    return;
                }
                trainingData = { potenciaBlocks: stripId<PotenciaBlockWithId>(potenciaBlocks), series: stripId<SerieWithId>(series) };
                break;
            default:
                alert('Tipo de entrenamiento no válido seleccionado.');
                return;
        }
        
        const newTraining: Training = {
            id: new Date().toISOString(),
            athleteName: athleteName.trim(),
            day: day,
            type: type,
            data: trainingData,
            date: new Date().toISOString(),
        };
        
        setHistory(prevHistory => [...prevHistory, newTraining]);
        alert('¡Entrenamiento registrado con éxito!');
        resetForm();
        setActiveTab('results');
    };

    const handleExportCsv = useCallback((trainingToExport: Training | null) => {
        if (!trainingToExport) return;

        try {
            const escapeCsvCell = (cell: string | number) => {
                const cellStr = String(cell || '');
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            };

            let fullCsv = "";
            
            const createCsv = (headers: string[], data: any[][]) => {
                const headerRow = headers.map(escapeCsvCell).join(',');
                const bodyRows = data.map(row => row.map(escapeCsvCell).join(','));
                return `${headerRow}\n${bodyRows.join('\n')}`;
            };

            const seriesHeaders = ['#', 'Distancia (m)', 'Tiempo', 'Recuperacion', 'Ritmo/100m (s)', 'Est. 800m', 'Sensaciones'];
            const aerobicHeaders = ['#', 'Tiempo (min)', 'Distancia (m)', 'Ritmo (min/km)', 'Sensaciones'];
            
            fullCsv += `Atleta,${escapeCsvCell(trainingToExport.athleteName)}\nTipo,${escapeCsvCell(trainingToExport.type)}\nFecha,${escapeCsvCell(formatDate(trainingToExport.date))}\n\n`;

            switch (trainingToExport.type) {
                case 'Series':
                    const seriesData = (trainingToExport.data as Serie[]).map((s, i) => {
                        const pacePer100 = s.distance > 0 ? (s.time / s.distance) * 100 : 0;
                        return [i + 1, s.distance, formatTime(s.time), formatTime(s.recovery), pacePer100.toFixed(2), formatTime(pacePer100 * 8), s.sensations];
                    });
                    fullCsv += createCsv(seriesHeaders, seriesData);
                    break;

                case 'Fartlek':
                case 'Potencia Aeróbica':
                    const aerobicData = (trainingToExport.data as (FartlekBlock | PotenciaBlock)[]).map((b, i) => {
                        const pacePerKm = b.distance > 0 ? formatTime((b.time * 60) / (b.distance / 1000)) : 'N/A';
                        return [i + 1, b.time, b.distance, pacePerKm, b.sensations];
                    });
                    fullCsv += createCsv(aerobicHeaders, aerobicData);
                    break;
                
                case 'Fartlek más Series':
                case 'Potencia Aeróbica más Series':
                    const combinedData = trainingToExport.data as FartlekSeriesData | PotenciaSeriesData;
                    const aerobicBlocks = 'fartlekBlocks' in combinedData ? combinedData.fartlekBlocks : combinedData.potenciaBlocks;

                    const aerobicRows = aerobicBlocks.map((b, i) => {
                        const pacePerKm = b.distance > 0 ? formatTime((b.time * 60) / (b.distance / 1000)) : 'N/A';
                        return [i + 1, b.time, b.distance, pacePerKm, b.sensations];
                    });
                    fullCsv += `Detalle ${'fartlekBlocks' in combinedData ? 'Fartlek' : 'Potencia Aeróbica'}\n`;
                    fullCsv += createCsv(aerobicHeaders, aerobicRows);
                    fullCsv += '\n\n';
                    
                    fullCsv += 'Detalle Series\n';
                    const seriesRows = combinedData.series.map((s, i) => {
                        const pacePer100 = s.distance > 0 ? (s.time / s.distance) * 100 : 0;
                        return [i + 1, s.distance, formatTime(s.time), formatTime(s.recovery), pacePer100.toFixed(2), formatTime(pacePer100 * 8), s.sensations];
                    });
                    fullCsv += createCsv(seriesHeaders, seriesRows);
                    break;
            }

            const BOM = "\uFEFF";
            const blob = new Blob([BOM + fullCsv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const filename = `entrenamiento-${trainingToExport.athleteName.replace(/\s/g, '_')}-${new Date(trainingToExport.date).toLocaleDateString('sv')}.csv`;

            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error al exportar CSV:", error);
            alert(`Ocurrió un error al exportar el CSV: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, []);

    const handleDeleteTraining = useCallback((id: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este entrenamiento?')) {
            const isLatest = latestTraining?.id === id;
            const isModal = modalTrainingId === id;

            setHistory(prevHistory => prevHistory.filter(t => t.id !== id));

            if (isModal) {
                setModalTrainingId(null);
            }
            if (isLatest) {
                setActiveTab('history');
            }
        }
    }, [latestTraining, modalTrainingId, setHistory]);
    
    const handleClearHistory = () => {
        if(window.confirm('¿Estás seguro de que quieres borrar TODO el historial? Esta acción no se puede deshacer.')) {
            setHistory([]);
        }
    };

    const renderSeriesForm = () => (
        <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold text-sky-700">Añadir Series</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Distancia (m)</label>
                    <input type="number" placeholder="ej. 400" min="0" value={currentSerie.distance} onChange={e => setCurrentSerie({ ...currentSerie, distance: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm font-medium text-slate-700 col-span-2">Tiempo</label>
                    <input type="number" placeholder="Min" min="0" value={currentSerie.timeMin} onChange={e => setCurrentSerie({ ...currentSerie, timeMin: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                    <input type="number" placeholder="Seg" min="0" max="59" value={currentSerie.timeSec} onChange={e => setCurrentSerie({ ...currentSerie, timeSec: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm font-medium text-slate-700 col-span-2">Recuperación</label>
                    <input type="number" placeholder="Min" min="0" value={currentSerie.recMin} onChange={e => setCurrentSerie({ ...currentSerie, recMin: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                    <input type="number" placeholder="Seg" min="0" max="59" value={currentSerie.recSec} onChange={e => setCurrentSerie({ ...currentSerie, recSec: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700">Sensaciones</label>
                    <textarea value={currentSerie.sensations} onChange={e => setCurrentSerie({ ...currentSerie, sensations: e.target.value })} rows={1} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm"></textarea>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={handleAddSerie} className="bg-sky-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-sky-600 w-full sm:w-auto min-h-[44px]">Añadir Serie</button>
                <button onClick={handleDuplicateLastSerie} className="bg-slate-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-600 flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px]"><DuplicateIcon /> Duplicar Última</button>
            </div>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
                {series.map((s) => (
                    <li key={s.tempId} className="flex justify-between items-center bg-slate-100 p-2 rounded-md fade-in">
                        <span>{s.distance}m en {formatTime(s.time)} (rec. {formatTime(s.recovery)}) - <i>{s.sensations || '...'}</i></span>
                        <button onClick={() => setSeries(prev => prev.filter(item => item.tempId !== s.tempId))} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                    </li>
                ))}
            </ul>
        </div>
    );
    
    const renderFartlekForm = () => (
         <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold text-amber-700">Añadir Bloque Fartlek</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Tiempo (min)</label>
                    <input type="number" placeholder="ej. 5" min="0" value={currentFartlek.time} onChange={e => setCurrentFartlek({ ...currentFartlek, time: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Distancia (m)</label>
                    <input type="number" placeholder="ej. 1000" min="0" value={currentFartlek.distance} onChange={e => setCurrentFartlek({ ...currentFartlek, distance: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Sensaciones</label>
                    <textarea value={currentFartlek.sensations} onChange={e => setCurrentFartlek({ ...currentFartlek, sensations: e.target.value })} rows={1} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm"></textarea>
                </div>
            </div>
            <div className="mt-4">
                <button onClick={handleAddFartlek} className="bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-600 w-full sm:w-auto min-h-[44px]">Añadir Bloque Fartlek</button>
            </div>
             <ul className="space-y-2 max-h-40 overflow-y-auto">
                {fartlekBlocks.map((b) => (
                    <li key={b.tempId} className="flex justify-between items-center bg-slate-100 p-2 rounded-md fade-in">
                        <span>Bloque: {b.time} min - {b.distance}m</span>
                        <button onClick={() => setFartlekBlocks(prev => prev.filter(item => item.tempId !== b.tempId))} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                    </li>
                ))}
            </ul>
        </div>
    );

    const renderPotenciaForm = () => (
        <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-semibold text-orange-700">Añadir Bloque Potencia Aeróbica</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Tiempo (min)</label>
                    <input type="number" min="0" value={currentPotencia.time} onChange={e => setCurrentPotencia({ ...currentPotencia, time: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700">Distancia (m)</label>
                    <input type="number" min="0" value={currentPotencia.distance} onChange={e => setCurrentPotencia({ ...currentPotencia, distance: e.target.value })} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Sensaciones</label>
                    <textarea value={currentPotencia.sensations} onChange={e => setCurrentPotencia({ ...currentPotencia, sensations: e.target.value })} rows={1} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm"></textarea>
                </div>
            </div>
             <div className="mt-4">
                <button onClick={handleAddPotencia} className="bg-orange-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-600 w-full sm:w-auto min-h-[44px]">Añadir Bloque</button>
            </div>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
                {potenciaBlocks.map((b) => (
                    <li key={b.tempId} className="flex justify-between items-center bg-slate-100 p-2 rounded-md fade-in">
                        <span>Bloque: {b.time} min - {b.distance}m - <i>{b.sensations || '...'}</i></span>
                        <button onClick={() => setPotenciaBlocks(prev => prev.filter(item => item.tempId !== b.tempId))} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                    </li>
                ))}
            </ul>
        </div>
    );

    const modalTraining = history.find(t => t.id === modalTrainingId);

    const showSeriesForm = type === 'Series' || type === 'Fartlek más Series' || type === 'Potencia Aeróbica más Series';
    const showFartlekForm = type === 'Fartlek' || type === 'Fartlek más Series';
    const showPotenciaForm = type === 'Potencia Aeróbica' || type === 'Potencia Aeróbica más Series';

    return (
        <>
            <div className="container mx-auto p-4 md:p-8 space-y-8">
                <header className="text-center p-8 md:p-12 bg-gradient-to-br from-sky-500 to-sky-700 text-white rounded-xl shadow-lg">
                    <h1 className="text-3xl md:text-5xl font-bold">Sistema de Entrenamiento Atlético</h1>
                    <p className="mt-2 text-lg md:text-xl text-sky-100">Plataforma profesional para registro y análisis de entrenamientos</p>
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                        <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm">Registro detallado de series y bloques aeróbicos</div>
                        <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm">Análisis automático de ritmos y rendimiento</div>
                        <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm">Exportación de informes en PDF y CSV</div>
                    </div>
                </header>

                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <DashboardCard icon={<ChartBarIcon />} title="Total Entrenamientos" value={dashboardStats.totalTrainings} color="#0EA5E9" />
                    <DashboardCard icon={<RunnerIcon />} title="Total de Series" value={dashboardStats.totalSeries} color="#10B981" />
                    <DashboardCard icon={<MuscleIcon />} title="Entr. P. Aeróbica" value={dashboardStats.totalPotencia} color="#F59E0B" />
                    <DashboardCard icon={<UsersIcon />} title="Usuarios Activos" value={dashboardStats.activeUsers} color="#8B5CF6" />
                </section>

                <main>
                    <div className="border-b border-slate-200 flex flex-col sm:flex-row">
                        <button onClick={() => setActiveTab('new')} className={`py-2 px-4 border-b-2 text-lg font-medium ${activeTab === 'new' ? 'tab-active' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Nuevo Entrenamiento</button>
                        <button onClick={() => setActiveTab('results')} className={`py-2 px-4 border-b-2 text-lg font-medium ${activeTab === 'results' ? 'tab-active' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Resultados</button>
                        <button onClick={() => setActiveTab('history')} className={`py-2 px-4 border-b-2 text-lg font-medium ${activeTab === 'history' ? 'tab-active' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>Historial</button>
                    </div>

                    <div className="mt-6">
                        {activeTab === 'new' && (
                            <div className="bg-white p-6 rounded-lg shadow-md space-y-6 fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="athleteName" className="block text-sm font-medium text-slate-700">Nombre del Atleta</label>
                                        <input type="text" id="athleteName" value={athleteName} onChange={(e) => setAthleteName(e.target.value)} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm" />
                                    </div>
                                    <div>
                                        <label htmlFor="day" className="block text-sm font-medium text-slate-700">Día de Entrenamiento</label>
                                        <select id="day" value={day} onChange={(e) => setDay(e.target.value as DayOfWeek)} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm">
                                            {(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as DayOfWeek[]).map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="type" className="block text-sm font-medium text-slate-700">Tipo de Entrenamiento</label>
                                        <select id="type" value={type} onChange={(e) => setType(e.target.value as TrainingType)} className="mt-1 block w-full rounded-md border-sky-500 shadow-sm">
                                            {(['Series', 'Fartlek', 'Potencia Aeróbica', 'Fartlek más Series', 'Potencia Aeróbica más Series'] as TrainingType[]).map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                                
                                {showSeriesForm && renderSeriesForm()}
                                {showFartlekForm && renderFartlekForm()}
                                {showPotenciaForm && renderPotenciaForm()}

                                <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
                                    <button onClick={handleRegister} className="bg-sky-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-sky-700 text-lg flex-grow min-h-[44px]">Registrar Entrenamiento</button>
                                    <button onClick={resetForm} className="bg-red-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-red-600 min-h-[44px]">Reiniciar Formulario</button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'results' && <ResultsDisplay training={latestTraining} onExportCsv={handleExportCsv} onDelete={handleDeleteTraining} />}
                        
                        {activeTab === 'history' && (
                            <div className="bg-white p-6 rounded-lg shadow-md fade-in">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold">Historial de Entrenamientos</h2>
                                    {history.length > 0 && <button onClick={handleClearHistory} className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600">Limpiar Historial</button>}
                                </div>
                                {history.length === 0 ? <p>No hay entrenamientos en el historial.</p> :
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="p-3">Fecha</th>
                                                <th className="p-3">Atleta</th>
                                                <th className="p-3">Tipo</th>
                                                <th className="p-3">Duración</th>
                                                <th className="p-3">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.slice().reverse().map(t => (
                                                <tr key={t.id} className="border-b hover:bg-slate-50">
                                                    <td className="p-3">{formatDate(t.date)}</td>
                                                    <td className="p-3">{t.athleteName}</td>
                                                    <td className="p-3">{t.type}</td>
                                                    <td className="p-3">{formatTime(calculateTotalDuration(t))}</td>
                                                    <td className="p-3 flex gap-2">
                                                        <button onClick={() => setModalTrainingId(t.id)} className="text-sky-600 hover:text-sky-800"><EyeIcon /></button>
                                                        <button onClick={() => handleDeleteTraining(t.id)} className="text-red-500 hover:text-red-700"><TrashIcon /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                }
                            </div>
                        )}
                    </div>
                </main>

                <Modal isOpen={!!modalTrainingId} onClose={() => setModalTrainingId(null)}>
                    {modalTraining ? (
                        <div>
                            <ResultsDisplay training={modalTraining} onExportCsv={handleExportCsv} onDelete={handleDeleteTraining} />
                        </div>
                    ) : null}
                </Modal>

                <footer className="text-center text-slate-500 text-sm pt-8">
                    <p>Copyright &copy; 2025-2026, Desarrollado por David Calvo. Todos los derechos reservados.</p>
                </footer>
            </div>
        </>
    );
};

export default App;