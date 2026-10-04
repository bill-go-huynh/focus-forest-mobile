import { EmptyState } from '../../../components/EmptyState';
import { Screen } from '../../../components/Screen';
import { CeremonyScreen } from '../../../forest/CeremonyScreen';
import { useMonthParam } from '../../../forest/month-param';

/** The month-end planting ceremony, full screen (M3.4). */
export default function Route() {
  const month = useMonthParam();
  if (!month) {
    return (
      <Screen>
        <EmptyState illustration="clearing" message="This month isn't in your forest." />
      </Screen>
    );
  }
  return <CeremonyScreen month={month} />;
}
