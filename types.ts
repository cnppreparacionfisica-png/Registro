export type TrainingType = 'Series' | 'Fartlek' | 'Potencia Aeróbica' | 'Fartlek más Series' | 'Potencia Aeróbica más Series';
export type DayOfWeek = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';

export interface Serie {
    distance: number;
    time: number; // in seconds
    recovery: number; // in seconds
    sensations?: string;
}

export interface FartlekBlock {
    time: number; // in minutes
    distance: number; // in meters
    sensations: string;
}

export interface PotenciaBlock {
    time: number; // in minutes
    distance: number; // in meters
    sensations?: string;
}

export interface FartlekSeriesData {
    fartlekBlocks: FartlekBlock[];
    series: Serie[];
}

export interface PotenciaSeriesData {
    potenciaBlocks: PotenciaBlock[];
    series: Serie[];
}

export interface Training {
    id: string;
    athleteName: string;
    day: DayOfWeek;
    type: TrainingType;
    data: Serie[] | FartlekBlock[] | PotenciaBlock[] | FartlekSeriesData | PotenciaSeriesData;
    date: string; // ISO string
}
