import { EmptyState } from '../../../components/EmptyState';
import { Screen } from '../../../components/Screen';
import { MonthDetailsScreen } from '../../../forest/MonthDetailsScreen';
import { useMonthParam } from '../../../forest/month-param';

/** Tree Details of a forest month: archived, resting, or growing (M3.4). */
export default function Route() {
  const month = useMonthParam();
  if (!month) {
    return (
      <Screen>
        <EmptyState illustration="clearing" message="This month isn't in your forest." />
      </Screen>
    );
  }
  return <MonthDetailsScreen month={month} />;
}
