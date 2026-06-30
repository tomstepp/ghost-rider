import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Route, RouteNode } from '../types';
import { IRideRepository } from '../storage/IRideRepository';
import { parseGpx } from '../utils/gpxParser';
import { exportGpx } from '../utils/gpxExporter';
import { RouteShape } from '../components/RouteShape';
import { ElevationProfile } from '../components/ElevationProfile';

function RouteThumbnail({ routeId, repository }: { routeId: number; repository: IRideRepository }) {
  const [nodes, setNodes] = useState<RouteNode[] | null>(null);
  useEffect(() => {
    repository.getRouteNodes(routeId).then(setNodes);
  }, [routeId, repository]);
  if (!nodes || nodes.length < 2) return <View style={styles.thumbnailPlaceholder} />;
  return <RouteShape nodes={nodes} width={64} height={48} strokeColor="#444" padding={4} />;
}

interface Props {
  repository: IRideRepository;
  onSelectRoute: (route: Route) => void;
  onStartFreeRide: () => void;
  onViewHistory: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  units: 'km' | 'mi';
}

function formatDistance(meters: number, units: 'km' | 'mi'): string {
  if (units === 'mi') {
    const miles = meters / 1609.34;
    return miles >= 0.1 ? `${miles.toFixed(1)} mi` : `${Math.round(meters)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDate(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function RouteListScreen({ repository, onSelectRoute, onStartFreeRide, onViewHistory, onOpenSettings, onOpenAbout, units }: Props) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Action sheet
  const [actionRoute, setActionRoute] = useState<Route | null>(null);

  // Delete confirmation
  const [deletingRoute, setDeletingRoute] = useState<Route | null>(null);

  // Rename
  const [renamingRoute, setRenamingRoute] = useState<Route | null>(null);
  const [renameText, setRenameText] = useState('');

  // GPX import
  const [importName, setImportName] = useState('');
  const [pendingImport, setPendingImport] = useState<{ nodes: Parameters<IRideRepository['saveRoute']>[1]; name: string } | null>(null);
  const [importing, setImporting] = useState(false);

  // Share route
  const [sharingRoute, setSharingRoute] = useState<Route | null>(null);
  const [sharingNodes, setSharingNodes] = useState<RouteNode[] | null>(null);
  const shareCardRef = useRef<View>(null);

  const { width } = useWindowDimensions();
  const shareCardWidth = width - 80;

  const loadRoutes = () => {
    repository.getAllRoutes().then((r) => {
      setRoutes(r);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadRoutes();
  }, [repository]);

  const handleDeleteConfirm = async () => {
    if (!deletingRoute) return;
    await repository.deleteRoute(deletingRoute.id);
    setDeletingRoute(null);
    loadRoutes();
  };

  const handleRenameConfirm = async () => {
    if (!renamingRoute || !renameText.trim()) return;
    await repository.renameRoute(renamingRoute.id, renameText.trim());
    setRenamingRoute(null);
    loadRoutes();
  };

  const handleImportGpx = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setImporting(true);
      const file = result.assets[0];
      const response = await fetch(file.uri);
      const content = await response.text();
      const { nodes, name, hasTimestamps } = parseGpx(content);

      if (!hasTimestamps) {
        Alert.alert(
          'No Timestamps Found',
          'This GPX file has no timing data. GhostRider needs timestamps to create a ghost. Export a recorded activity (not a planned route) from Strava, RideWithGPS, or Garmin.',
        );
        setImporting(false);
        return;
      }

      const suggestedName = name ?? file.name?.replace(/\.gpx$/i, '') ?? 'Imported Route';
      setImportName(suggestedName);
      setPendingImport({ nodes, name: suggestedName });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Import Failed', msg);
    } finally {
      setImporting(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!pendingImport || !importName.trim()) return;
    await repository.saveRoute(importName.trim(), pendingImport.nodes);
    setPendingImport(null);
    loadRoutes();
  };

  const handleExportGpx = async (route: Route) => {
    try {
      const nodes = await repository.getRouteNodes(route.id);
      const gpx = exportGpx(nodes, route.name);
      const safeName = route.name.replace(/[^a-z0-9]/gi, '_');
      const file = new File(Paths.cache, `${safeName}.gpx`);
      file.create();
      file.write(gpx);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml', dialogTitle: 'Export GPX' });
    } catch (e) {
      Alert.alert('Export Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleShareRoute = async (route: Route) => {
    setSharingRoute(route);
    setSharingNodes(null);
    const nodes = await repository.getRouteNodes(route.id);
    setSharingNodes(nodes);
  };

  const doShareRoute = async () => {
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share route' });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const closeShareModal = () => {
    setSharingRoute(null);
    setSharingNodes(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
        <Text style={styles.title}>GHOST RIDER</Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.hamburger}>
          <Text style={styles.hamburgerText}>☰</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.freeRideButton} onPress={onStartFreeRide}>
        <Text style={styles.freeRideText}>START RIDE</Text>
        <Text style={styles.freeRideSubtext}>Record a new ghost</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.importButton} onPress={handleImportGpx} disabled={importing}>
        {importing
          ? <ActivityIndicator color="#888" size="small" />
          : <Text style={styles.importButtonText}>Import GPX</Text>
        }
      </TouchableOpacity>

      {loading ? null : routes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No saved ghosts yet.</Text>
          <Text style={styles.emptySubtext}>
            Complete a ride to save it as a ghost template.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>RACE A GHOST</Text>
          <FlatList
            data={routes}
            keyExtractor={(r) => String(r.id)}
            renderItem={({ item }) => (
              <View style={styles.routeItem}>
                <RouteThumbnail routeId={item.id} repository={repository} />
                <TouchableOpacity style={styles.routeMain} onPress={() => onSelectRoute(item)}>
                  <Text style={styles.routeName}>{item.name}</Text>
                  <Text style={styles.routeMeta}>
                    {formatDistance(item.total_distance, units)} · {formatDate(item.created_at)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editButton} onPress={() => setActionRoute(item)}>
                  <Text style={styles.editButtonText}>⋯</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      )}

      {/* Action sheet */}
      <Modal
        visible={actionRoute !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActionRoute(null)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setActionRoute(null)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{actionRoute?.name}</Text>

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                const route = actionRoute!;
                setActionRoute(null);
                onSelectRoute(route);
              }}
            >
              <Text style={styles.sheetActionText}>Start Race</Text>
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                const route = actionRoute!;
                setActionRoute(null);
                handleShareRoute(route);
              }}
            >
              <Text style={styles.sheetActionText}>Share Route</Text>
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setRenameText(actionRoute!.name);
                setRenamingRoute(actionRoute);
                setActionRoute(null);
              }}
            >
              <Text style={styles.sheetActionText}>Rename</Text>
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                const route = actionRoute!;
                setActionRoute(null);
                handleExportGpx(route);
              }}
            >
              <Text style={styles.sheetActionText}>Export GPX</Text>
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            <TouchableOpacity
              style={styles.sheetAction}
              onPress={() => {
                setDeletingRoute(actionRoute);
                setActionRoute(null);
              }}
            >
              <Text style={[styles.sheetActionText, styles.destructive]}>Delete</Text>
            </TouchableOpacity>

            <View style={styles.sheetGap} />

            <TouchableOpacity
              style={[styles.sheetAction, styles.sheetCancel]}
              onPress={() => setActionRoute(null)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share route preview */}
      <Modal
        visible={sharingRoute !== null}
        transparent
        animationType="slide"
        onRequestClose={closeShareModal}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={closeShareModal}>
          <TouchableOpacity activeOpacity={1} style={styles.shareSheet}>
            <View style={styles.sheetHandle} />

            <ScrollView contentContainerStyle={styles.shareScrollContent} showsVerticalScrollIndicator={false}>
              <View ref={shareCardRef} style={styles.shareCard} collapsable={false}>
                {sharingNodes === null ? (
                  <ActivityIndicator color="#555" style={styles.shareLoading} />
                ) : sharingNodes.length > 1 ? (
                  <>
                    <RouteShape nodes={sharingNodes} width={shareCardWidth} height={shareCardWidth * 0.55} strokeColor="#555" padding={8} />
                    <View style={styles.shareElevation}>
                      <ElevationProfile nodes={sharingNodes} width={shareCardWidth} height={48} />
                    </View>
                  </>
                ) : null}
                <Text style={styles.shareRouteName}>{sharingRoute?.name}</Text>
                <Text style={styles.shareRouteMeta}>
                  {sharingRoute
                    ? `${formatDistance(sharingRoute.total_distance, units)} · ${formatDuration(sharingRoute.total_time_ms)}`
                    : ''}
                </Text>
                <Text style={styles.shareCardBrand}>GhostRider</Text>
              </View>

              <TouchableOpacity
                style={[styles.shareActionButton, sharingNodes === null && styles.shareActionDisabled]}
                onPress={doShareRoute}
                disabled={sharingNodes === null}
              >
                <Text style={styles.shareActionText}>SHARE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetAction} onPress={closeShareModal}>
                <Text style={[styles.sheetActionText, { color: '#555' }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        visible={deletingRoute !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeletingRoute(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Delete Ghost</Text>
            <Text style={styles.modalBody}>
              Delete "{deletingRoute?.name}"? This cannot be undone.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDeletingRoute(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDelete} onPress={handleDeleteConfirm}>
                <Text style={styles.modalDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* GPX import name modal */}
      <Modal
        visible={pendingImport !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingImport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Name Your Ghost</Text>
            <TextInput
              style={styles.modalInput}
              value={importName}
              onChangeText={setImportName}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleImportConfirm}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setPendingImport(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, !importName.trim() && styles.modalSaveDisabled]}
                onPress={handleImportConfirm}
                disabled={!importName.trim()}
              >
                <Text style={styles.modalSaveText}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename modal */}
      <Modal
        visible={renamingRoute !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingRoute(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Rename Ghost</Text>
            <TextInput
              style={styles.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setRenamingRoute(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, !renameText.trim() && styles.modalSaveDisabled]}
                onPress={handleRenameConfirm}
                disabled={!renameText.trim()}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hamburger menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setMenuOpen(false); onViewHistory(); }}>
              <Text style={styles.sheetActionText}>History</Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setMenuOpen(false); onOpenSettings(); }}>
              <Text style={styles.sheetActionText}>Settings</Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetAction} onPress={() => { setMenuOpen(false); onOpenAbout(); }}>
              <Text style={styles.sheetActionText}>About</Text>
            </TouchableOpacity>
            <View style={styles.sheetGap} />
            <TouchableOpacity style={[styles.sheetAction, styles.sheetCancel]} onPress={() => setMenuOpen(false)}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 10,
  },
  appIcon: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
  },
  hamburger: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  hamburgerText: {
    fontSize: 22,
    color: '#888',
  },
  headerButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerButtonText: {
    fontSize: 17,
    color: '#888',
  },
  freeRideButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
  },
  freeRideText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 2,
  },
  freeRideSubtext: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  importButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    padding: 14,
    marginBottom: 40,
    alignItems: 'center',
  },
  importButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 2,
    marginBottom: 12,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  thumbnailPlaceholder: {
    width: 64,
    height: 48,
  },
  routeMain: {
    flex: 1,
    paddingVertical: 16,
  },
  routeName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  routeMeta: {
    fontSize: 13,
    color: '#555',
    marginTop: 3,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  editButtonText: {
    fontSize: 22,
    color: '#555',
    letterSpacing: 1,
  },
  empty: {
    marginTop: 40,
    alignItems: 'center',
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
    textAlign: 'center',
  },

  // Action sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
    letterSpacing: 1,
    paddingVertical: 16,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: '#1e1e1e',
  },
  sheetAction: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  sheetActionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  sheetGap: {
    height: 8,
    backgroundColor: '#000',
    borderRadius: 4,
    marginVertical: 8,
  },
  sheetCancel: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
  },
  sheetCancelText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#888',
  },
  destructive: {
    color: '#f44336',
  },

  // Share route preview
  shareSheet: {
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  shareScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  shareCard: {
    backgroundColor: '#000',
    width: '100%',
    alignItems: 'center',
    paddingBottom: 20,
    marginBottom: 16,
  },
  shareLoading: {
    marginVertical: 60,
  },
  shareElevation: {
    marginTop: 8,
  },
  shareRouteName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  shareRouteMeta: {
    fontSize: 13,
    color: '#555',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  shareCardBrand: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2a2a2a',
    letterSpacing: 3,
    marginTop: 20,
  },
  shareActionButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  shareActionDisabled: {
    backgroundColor: '#222',
  },
  shareActionText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 2,
  },

  // Shared modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    fontSize: 15,
    color: '#888',
  },
  modalSave: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalSaveDisabled: {
    backgroundColor: '#333',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  modalDelete: {
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalDeleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
