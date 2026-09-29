/**
 * O kit do sistema. Toda tela nova monta com estas peças, e só com elas.
 * Cores, texto, cantos e espaços vêm de src/index.css (tokens) e de
 * tailwind.config.js. A vitrine viva está em /kit.
 */
export { KPICard } from './KPICard';
export type { KPITom } from './KPICard';
export { PageHeader } from './PageHeader';
export { SectionCard } from './SectionCard';
export { Badge } from './Badge';
export type { BadgeVariante } from './Badge';
export { DataTable } from './DataTable';
export type { Column } from './DataTable';
export { EmptyState } from './EmptyState';
export { TableSkeleton, CardSkeleton, SkeletonLine } from './Skeleton';
export { Button, IconButton } from './Button';
export type { ButtonProps, BotaoVariante, BotaoTamanho } from './Button';
export { Campo, Input, Select, Textarea } from './Field';
export { Chip } from './Chip';
export type { ChipTom } from './Chip';
export { Segmented } from './Segmented';
export type { OpcaoSegmentada } from './Segmented';
export { Toolbar } from './Toolbar';
