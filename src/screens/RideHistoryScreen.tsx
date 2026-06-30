import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RideHistory, RouteNode } from '../types';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { IRideRepository } from '../storage/IRideRepository';
import { Units, formatDistance, formatPace, formatElevation } from '../utils/formatting';
import { RouteShape } from '../components/RouteShape';
import { ElevationProfile } from '../components/ElevationProfile';

interface EnrichedHistory extends RideHistory {
  routeName?: string;
}

interface Props {
  repository: IRideRepository;
  units: Units;
  onBack: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function formatDate(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type RaceResult = 'won' | 'lost' | 'tie' | 'ride';

function formatDelta(delta: number, hasGhost: boolean): { text: string; result: RaceResult } {
  if (!hasGhost) return { text: '--', result: 'ride' };
  if (Math.abs(delta) < 1000) return { text: 'Neck and neck', result: 'tie' };
  const seconds = Math.abs(delta / 1000).toFixed(1);
  if (delta < 0) return { text: `${seconds}s ahead`, result: 'won' };
  return { text: `${seconds}s behind`, result: 'lost' };
}

const RESULT_LABEL: Record<RaceResult, string> = {
  won: 'WON', lost: 'LOST', tie: 'TIE', ride: 'RIDE',
};

const RESULT_COLOR: Record<RaceResult, string> = {
  won: '#4caf50', lost: '#f44336', tie: '#ffc107', ride: '#555',
};

export function RideHistoryScreen({ repository, units, onBack }: Props) {
  const [history, setHistory] = useState<EnrichedHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<EnrichedHistory | null>(null);
  const [entryNodes, setEntryNodes] = useState<RouteNode[] | null>(null);
  const { width } = useWindowDimensions();
  const shareCardRef = useRef<View>(null);

  const handleShareEntry = async () => {
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share ride' });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const loadHistory = useCallback(async () => {
    const [entries, routes] = await Promise.all([
      repository.getRideHistory(),
      repository.getAllRoutes(),
    ]);
    const routeMap = new Map<number, string>(routes.map((r) => [r.id, r.name]));
    setHistory(
      entries.map((e) => ({
        ...e,
        routeName: e.route_id != null ? routeMap.get(e.route_id) : undefined,
      })),
    );
    setLoading(false);
  }, [repository]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDeleteEntry = useCallback((entry: EnrichedHistory) => {
    Alert.alert(
      'Delete Ride',
      'Delete this ride from your history? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await repository.deleteRideHistory(entry.id);
            setSelectedEntry(null);
            loadHistory();
          },
        },
      ],
    );
  }, [repository, loadHistory]);

  // Load ghost route nodes when a ride is selected
  useEffect(() => {
    if (!selectedEntry?.route_id) {
      setEntryNodes(null);
      return;
    }
    repository.getRouteNodes(selectedEntry.route_id).then(setEntryNodes);
  }, [selectedEntry, repository]);

  const vizWidth = width - 48;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>RIDE HISTORY</Text>
      </View>

      {loading ? null : history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No rides yet.</Text>
          <Text style={styles.emptySubtext}>Complete a ride to see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const delta = formatDelta(item.final_time_delta, item.route_id != null);
            return (
              <TouchableOpacity style={styles.card} onPress={() => setSelectedEntry(item)} activeOpacity={0.7}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardDate}>{formatDate(item.completed_at)}</Text>
                  <Text style={[styles.cardResult, { color: RESULT_COLOR[delta.result] }]}>
                    {RESULT_LABEL[delta.result]}
                  </Text>
                </View>
                {item.routeName && (
                  <Text style={styles.cardGhost}>vs {item.routeName}</Text>
                )}
                <View style={styles.cardStats}>
                  <View style={styles.statRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>
                        {formatDistance(item.avg_speed * (item.duration_ms / 1000), units)}
                      </Text>
                      <Text style={styles.statLabel}>DISTANCE</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{formatDuration(item.duration_ms)}</Text>
                      <Text style={styles.statLabel}>TIME</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.tapHint}>Tap for details ›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Ride detail modal */}
      <Modal
        visible={selectedEntry !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {selectedEntry && (() => {
              const delta = formatDelta(selectedEntry.final_time_delta, selectedEntry.route_id != null);
              const distanceM = selectedEntry.avg_speed * (selectedEntry.duration_ms / 1000);
              return (
                <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                  <View ref={shareCardRef} style={styles.modalShareCard} collapsable={false}>
                    <View style={styles.modalHeader}>
                      <View>
                        <Text style={styles.modalDate}>{formatDate(selectedEntry.completed_at)}</Text>
                        {selectedEntry.routeName && (
                          <Text style={styles.modalRoute}>vs {selectedEntry.routeName}</Text>
                        )}
                      </View>
                      <View style={styles.modalResultBadge}>
                        <Text style={[styles.modalResultText, { color: RESULT_COLOR[delta.result] }]}>
                          {RESULT_LABEL[delta.result]}
                        </Text>
                      </View>
                    </View>

                    {entryNodes && entryNodes.length > 1 && (
                      <View style={styles.modalVisuals}>
                        <RouteShape nodes={entryNodes} width={vizWidth} height={vizWidth * 0.5} strokeColor="#555" />
                        <View style={{ marginTop: 8 }}>
                          <ElevationProfile nodes={entryNodes} width={vizWidth} height={56} />
                        </View>
                      </View>
                    )}

                    <View style={styles.modalStats}>
                      <View style={styles.modalStatRow}>
                        <View style={styles.modalStat}>
                          <Text style={styles.modalStatValue}>{formatDistance(distanceM, units)}</Text>
                          <Text style={styles.modalStatLabel}>DISTANCE</Text>
                        </View>
                        <View style={styles.modalStat}>
                          <Text style={styles.modalStatValue}>{formatDuration(selectedEntry.duration_ms)}</Text>
                          <Text style={styles.modalStatLabel}>TIME</Text>
                        </View>
                      </View>
                      <View style={styles.modalStatRow}>
                        <View style={styles.modalStat}>
                          <Text style={styles.modalStatValue}>{formatPace(selectedEntry.avg_speed, units)}</Text>
                          <Text style={styles.modalStatLabel}>AVG PACE</Text>
                        </View>
                        <View style={styles.modalStat}>
                          <Text style={styles.modalStatValue}>
                            ↑ {formatElevation(selectedEntry.elevation_gain_m ?? 0, units)}
                          </Text>
                          <Text style={styles.modalStatLabel}>ELEV GAIN</Text>
                        </View>
                      </View>
                      {selectedEntry.route_id != null && (
                        <View style={styles.modalStatRow}>
                          <View style={styles.modalStat}>
                            <Text style={[styles.modalStatValue, { color: RESULT_COLOR[delta.result] }]}>
                              {delta.text}
                            </Text>
                            <Text style={styles.modalStatLabel}>FINAL DELTA</Text>
                          </View>
                          <View style={styles.modalStat}>
                            <Text style={styles.modalStatValue}>
                              {Math.round(selectedEntry.completed_percentage)}%
                            </Text>
                            <Text style={styles.modalStatLabel}>COMPLETED</Text>
                          </View>
                        </View>
                      )}
                    </View>

                    <Text style={styles.modalShareBrand}>GhostRider</Text>
                  </View>

                  <TouchableOpacity style={styles.shareButton} onPress={handleShareEntry}>
                    <Text style={styles.shareButtonText}>SHARE RIDE</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedEntry(null)}>
                    <Text style={styles.closeButtonText}>CLOSE</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteEntry(selectedEntry)}>
                    <Text style={styles.deleteButtonText}>DELETE RIDE</Text>
                  </TouchableOpacity>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    marginBottom: 12,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 20,
    color: '#888',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 3,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 13,
    color: '#555',
  },
  cardResult: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  cardGhost: {
    fontSize: 15,
    fontWeight: '700',
    color: '#aaa',
    marginBottom: 12,
  },
  cardStats: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 24,
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: '#555',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  tapHint: {
    fontSize: 11,
    color: '#333',
    marginTop: 12,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#444',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  modalContent: {
    padding: 24,
    paddingBottom: 48,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalDate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalRoute: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  modalResultBadge: {
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modalResultText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  modalVisuals: {
    marginBottom: 24,
  },
  modalStats: {
    gap: 20,
    marginBottom: 32,
  },
  modalStatRow: {
    flexDirection: 'row',
    gap: 24,
  },
  modalStat: {
    flex: 1,
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalStatLabel: {
    fontSize: 10,
    color: '#555',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  modalShareCard: {
    backgroundColor: '#0d0d0d',
    width: '100%',
    paddingBottom: 20,
    marginBottom: 16,
  },
  modalShareBrand: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e1e1e',
    letterSpacing: 3,
    textAlign: 'center',
    marginTop: 16,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 2,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#555',
    letterSpacing: 2,
  },
  deleteButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#f44336',
    letterSpacing: 2,
  },
});
