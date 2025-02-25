import unittest
from collections import Counter
from concept_clustering import cluster_concepts
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)


class TestConceptClustering(unittest.TestCase):
    def test_single_cluster_merge(self):
        # Two concepts that should normalize to the same term.
        overall = [("anxiety", 10), ("anxieties", 5)]
        input_data = {"overall": overall, "demographics": {}}
        clusters = cluster_concepts(input_data)
        overall_clusters = clusters["overall"]

        # Expect one merged cluster.
        self.assertEqual(len(overall_clusters), 1)
        self.assertEqual(overall_clusters[0]["frequency"], 15)
        # The representative label should be one of the normalized forms.
        self.assertIn(overall_clusters[0]["label"], ["anxiety", "anxiety"])

    def test_multiple_clusters_limit(self):
        # Create 25 unique concepts, each with frequency 1.
        overall = [(f"concept{i}", 1) for i in range(25)]
        input_data = {"overall": overall, "demographics": {}}
        clusters = cluster_concepts(input_data)
        overall_clusters = clusters["overall"]

        # Should force exactly 20 clusters.
        self.assertEqual(len(overall_clusters), 20)
        # Total frequency should be the sum of all frequencies (25).
        total_freq = sum(cluster["frequency"] for cluster in overall_clusters)
        self.assertEqual(total_freq, 25)

    def test_demographic_clustering(self):
        overall = [("stress", 3), ("pressure", 2)]
        demographics = {
            "group1": [("stress", 2), ("anxiety", 4)]
        }
        input_data = {"overall": overall, "demographics": demographics}
        clusters = cluster_concepts(input_data)

        # Validate overall clustering.
        overall_clusters = clusters["overall"]
        overall_total = sum(cluster["frequency"] for cluster in overall_clusters)
        expected_overall_total = sum(freq for _, freq in overall)
        self.assertEqual(overall_total, expected_overall_total)

        # Validate demographic clustering.
        demo_clusters = clusters["demographics"].get("group1", [])
        demo_total = sum(cluster["frequency"] for cluster in demo_clusters)
        expected_demo_total = sum(freq for _, freq in demographics["group1"])
        self.assertEqual(demo_total, expected_demo_total)

if __name__ == '__main__':
    unittest.main()
